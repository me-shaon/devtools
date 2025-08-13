class ImageConverter {
    constructor() {
        this.currentImage = null;
        this.init();
    }

    init() {
        const dropZone = document.getElementById('image-drop-zone');
        const fileInput = document.getElementById('image-file-input');
        const convertBtn = document.getElementById('convert-image');
        const formatSelect = document.getElementById('output-format');
        const qualitySlider = document.getElementById('quality-slider');
        const qualityValue = document.getElementById('quality-value');

        if (dropZone) {
            dropZone.addEventListener('click', () => fileInput?.click());
            dropZone.addEventListener('dragover', (e) => this.handleDragOver(e));
            dropZone.addEventListener('drop', (e) => this.handleDrop(e));
            dropZone.addEventListener('dragleave', (e) => this.handleDragLeave(e));
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        }

        if (convertBtn) {
            convertBtn.addEventListener('click', () => this.convertImage());
        }

        if (formatSelect) {
            formatSelect.addEventListener('change', () => this.toggleQualityOptions());
        }

        if (qualitySlider) {
            qualitySlider.addEventListener('input', (e) => {
                qualityValue.textContent = e.target.value;
            });
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.style.backgroundColor = '#f0f8ff';
        e.currentTarget.style.borderColor = '#667eea';
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.style.backgroundColor = '';
        e.currentTarget.style.borderColor = '';
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.style.backgroundColor = '';
        e.currentTarget.style.borderColor = '';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const files = e.target.files;
        if (files.length > 0) {
            this.processFile(files[0]);
        }
    }

    processFile(file) {
        if (!file.type.startsWith('image/')) {
            window.app?.showMessage('Please select a valid image file.', 'error');
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            window.app?.showMessage('File size should be less than 50MB.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            this.loadImage(e.target.result, file);
        };
        reader.readAsDataURL(file);
    }

    loadImage(dataUrl, file) {
        const img = new Image();
        img.onload = () => {
            this.currentImage = {
                img,
                dataUrl,
                file,
                width: img.width,
                height: img.height
            };
            this.showImagePreview();
            this.showConversionOptions();
        };
        img.src = dataUrl;
    }

    showImagePreview() {
        const preview = document.getElementById('image-preview');
        const previewImg = document.getElementById('preview-image');
        const imageName = document.getElementById('image-name');
        const imageSize = document.getElementById('image-size');
        const imageDimensions = document.getElementById('image-dimensions');

        previewImg.src = this.currentImage.dataUrl;
        imageName.textContent = this.currentImage.file.name;
        imageSize.textContent = this.formatFileSize(this.currentImage.file.size);
        imageDimensions.textContent = `${this.currentImage.width} × ${this.currentImage.height}`;

        preview.style.display = 'block';
    }

    showConversionOptions() {
        const options = document.getElementById('conversion-options');
        options.style.display = 'block';
        this.toggleQualityOptions();
    }

    toggleQualityOptions() {
        const format = document.getElementById('output-format').value;
        const qualityOptions = document.getElementById('quality-options');
        
        if (format === 'jpeg' || format === 'webp') {
            qualityOptions.style.display = 'block';
        } else {
            qualityOptions.style.display = 'none';
        }
    }

    convertImage() {
        if (!this.currentImage) {
            window.app?.showMessage('Please select an image first.', 'error');
            return;
        }

        const format = document.getElementById('output-format').value;
        const quality = document.getElementById('quality-slider').value / 100;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = this.currentImage.width;
        canvas.height = this.currentImage.height;

        if (format === 'jpeg') {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.drawImage(this.currentImage.img, 0, 0);

        let mimeType = 'image/' + format;
        if (format === 'jpeg') {
            mimeType = 'image/jpeg';
        }

        const convertedDataUrl = canvas.toDataURL(mimeType, quality);
        this.downloadImage(convertedDataUrl, format);
    }

    downloadImage(dataUrl, format) {
        const link = document.createElement('a');
        const originalName = this.currentImage.file.name.split('.')[0];
        
        link.download = `${originalName}.${format}`;
        link.href = dataUrl;
        link.click();

        window.app?.showMessage(`Image converted and downloaded as ${format.toUpperCase()}!`, 'success');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

window.ImageConverter = new ImageConverter();

const imageStyles = `
.file-drop-zone {
    border: 2px dashed #d0d0d0;
    border-radius: 8px;
    padding: 40px 20px;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    background-color: #fafafa;
}

.file-drop-zone:hover {
    border-color: #667eea;
    background-color: #f0f8ff;
}

.file-drop-zone i {
    font-size: 3rem;
    color: #86868b;
    margin-bottom: 15px;
}

.file-drop-zone p {
    color: #86868b;
    margin: 0;
    font-size: 16px;
}

.image-preview {
    margin: 20px 0;
    text-align: center;
}

#preview-image {
    max-width: 100%;
    max-height: 300px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.image-info {
    display: flex;
    justify-content: center;
    gap: 20px;
    margin-top: 15px;
    flex-wrap: wrap;
}

.image-info span {
    background: #f0f0f0;
    padding: 5px 12px;
    border-radius: 20px;
    font-size: 12px;
    color: #666;
}

.conversion-options {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 20px;
    margin-top: 20px;
}

.format-options,
.quality-options {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
    flex-wrap: wrap;
}

.format-options label,
.quality-options label {
    font-weight: 500;
    color: #1d1d1f;
}

.format-options select {
    padding: 8px 12px;
    border: 2px solid #f0f0f0;
    border-radius: 6px;
    font-size: 14px;
}

#quality-slider {
    flex: 1;
    min-width: 150px;
}

#quality-value {
    min-width: 35px;
    text-align: right;
    font-weight: bold;
    color: #667eea;
}
`;

const imageConverterStyle = document.createElement('style');
style.textContent = imageStyles;
document.head.appendChild(imageConverterStyle);