BOT_NAME = "scrapers_spiders"

SPIDER_MODULES = ["scrapers.spiders"]
NEWSPIDER_MODULE = "scrapers.spiders"

ROBOTSTXT_OBEY = True

DOWNLOADER_MIDDLEWARES = {
    "scrapers.spiders.middlewares.UserAgentMiddleware": 400,
}

ITEM_PIPELINES = {
    "scrapers.spiders.pipelines.NormalizerPipeline": 300,
}

USER_AGENT = "HireGen-LeadGen/1.0 (+https://github.com/HireGen-LeadGen)"
