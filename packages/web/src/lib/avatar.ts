/**
 * Turn a user-selected photo into a compact, square avatar data URL.
 *
 * The image is centre-cropped and downscaled to 256×256 JPEG before it ever
 * reaches the API. That keeps the stored payload small (usually 20–60 KB) and
 * avoids sending multi-megabyte originals through the profile endpoint.
 */
export function imageFileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Choose a JPG, PNG, or WebP image.'));
  }
  if (file.size > 6 * 1024 * 1024) {
    return Promise.reject(new Error('Image must be 6 MB or smaller.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image. Try another file.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That image could not be decoded. Try another file.'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('Your browser could not process the image.'));
          return;
        }
        // A warm backdrop keeps transparent PNGs from turning black in JPEG.
        context.fillStyle = '#f3e3d7';
        context.fillRect(0, 0, size, size);
        const sourceSize = Math.min(image.width, image.height);
        const sourceX = (image.width - sourceSize) / 2;
        const sourceY = (image.height - sourceSize) / 2;
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
