import { isLegalTransition, assertStageTransition, legalSuccessors } from '../src/utils/lifecycle';

describe('Lead lifecycle transition machine (mirrors DB trigger)', () => {
  test('happy path is legal', () => {
    expect(isLegalTransition('discovered', 'enriching')).toBe(true);
    expect(isLegalTransition('enriching', 'enriched')).toBe(true);
    expect(isLegalTransition('enriched', 'verifying')).toBe(true);
    expect(isLegalTransition('verifying', 'verified')).toBe(true);
    expect(isLegalTransition('verified', 'drafted')).toBe(true);
    expect(isLegalTransition('drafted', 'send_pending')).toBe(true);
    expect(isLegalTransition('send_pending', 'sent')).toBe(true);
    expect(isLegalTransition('sent', 'delivered')).toBe(true);
    expect(isLegalTransition('delivered', 'replied')).toBe(true);
    expect(isLegalTransition('replied', 'converted')).toBe(true);
  });

  test('forward skips are legal (writers jump to outcome stages)', () => {
    expect(isLegalTransition('discovered', 'verified')).toBe(true);
    expect(isLegalTransition('discovered', 'contacted')).toBe(true);
    expect(isLegalTransition('enriched', 'drafted')).toBe(true);
    expect(isLegalTransition('verified', 'contacted')).toBe(true);
  });

  test('failure states route to retry, never backward silently', () => {
    expect(isLegalTransition('send_pending', 'provider_error')).toBe(true);
    expect(isLegalTransition('provider_error', 'retry_pending')).toBe(true);
    expect(isLegalTransition('retry_pending', 'send_pending')).toBe(true);
    expect(isLegalTransition('verification_failed', 'verifying')).toBe(true);
    expect(isLegalTransition('enrichment_failed', 'enriching')).toBe(true);
    expect(isLegalTransition('contact_unavailable', 'enriching')).toBe(true);
  });

  test('impossible jumps are illegal', () => {
    // backward on the happy path (resurrection / corruption)
    expect(isLegalTransition('sent', 'drafted')).toBe(false);
    expect(isLegalTransition('contacted', 'discovered')).toBe(false);
    expect(isLegalTransition('sent', 'discovered')).toBe(false);
    expect(isLegalTransition('delivered', 'verified')).toBe(false);
    expect(isLegalTransition('replied', 'send_pending')).toBe(false);
    // wrong failure entries
    expect(isLegalTransition('discovered', 'bounced')).toBe(false);
    expect(isLegalTransition('enriched', 'send_failed')).toBe(false);
    expect(isLegalTransition('send_failed', 'sent')).toBe(false);
    // terminal exits
    expect(isLegalTransition('converted', 'discovered')).toBe(false);
    expect(isLegalTransition('suppressed', 'discovered')).toBe(false);
    expect(isLegalTransition('bogus', 'sent')).toBe(false);
  });

  test('any stage can reach suppressed; suppressed/converted are terminal', () => {
    for (const from of ['discovered', 'verifying', 'drafted', 'send_pending', 'bounced']) {
      expect(isLegalTransition(from, 'suppressed')).toBe(true);
    }
    expect(legalSuccessors('suppressed')).toEqual([]);
    expect(legalSuccessors('converted')).toEqual([]);
  });

  test('assertStageTransition throws with a readable error', () => {
    expect(() => assertStageTransition('sent', 'drafted')).toThrow(
      'illegal lead stage transition: sent -> drafted',
    );
    expect(() => assertStageTransition('verified', 'drafted')).not.toThrow();
  });
});
