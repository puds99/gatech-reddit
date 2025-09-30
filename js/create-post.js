/**
 * ===============================================================================
 * CREATE-POST.JS - Post Creation Logic
 * GA Tech AI & Vibe-Coding Community Platform
 * Version: 1.0.0 - ES2025 Modern JavaScript
 * ===============================================================================
 */

import { marked } from 'https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js';
import hljs from 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/es/highlight.min.js';

// ===============================================================================
// CREATE POST CONFIGURATION
// ===============================================================================

const CreatePostConfig = {
  titleMaxLength: 300,
  contentMaxLength: 40000,
  linkMaxLength: 2048,
  maxTags: 5,
  maxImages: 20,
  maxFileSize: 10485760, // 10MB
  allowedImageTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  autoSaveInterval: 30000, // 30 seconds
  draftKey: 'post-draft',
  communities: [
    { id: 'ai-coding', name: 'AI & Coding', description: 'Artificial Intelligence and Programming' },
    { id: 'webdev', name: 'Web Development', description: 'Frontend, Backend, and Full Stack' },
    { id: 'cs1332', name: 'CS 1332', description: 'Data Structures and Algorithms' },
    { id: 'hackgt', name: 'HackGT', description: 'Georgia Tech Hackathon' },
    { id: 'career', name: 'Career', description: 'Internships and Job Opportunities' },
    { id: 'vibe-code', name: 'Vibe Code', description: 'AI-Assisted Coding' }
  ],
  tags: [
    'help', 'discussion', 'project', 'resource', 'question',
    'tutorial', 'showcase', 'announcement', 'meta', 'feedback'
  ],
  codeLanguages: [
    'javascript', 'python', 'java', 'c++', 'c', 'c#', 'go', 'rust',
    'typescript', 'jsx', 'tsx', 'html', 'css', 'sql', 'bash', 'powershell'
  ]
};

// ===============================================================================
// CREATE POST MANAGER
// ===============================================================================

class CreatePostManager {
  constructor() {
    this.postType = 'text';
    this.selectedCommunity = null;
    this.selectedTags = new Set();
    this.uploadedImages = new Map();
    this.isDirty = false;
    this.isSubmitting = false;
    this.autoSaveTimer = null;
    this.markdownEditor = null;
    this.codeEditor = null;
    this.init();
  }

  init() {
    this.setupElements();
    this.setupEventListeners();
    this.setupValidation();
    this.setupMarkdown();
    this.loadDraft();
    this.setupAutoSave();
    this.setupCodeEditor();
  }

  setupElements() {
    // Form elements
    this.form = document.querySelector('[data-create-post-form]');
    this.titleInput = document.querySelector('[data-title-input]');
    this.contentTextarea = document.querySelector('[data-content-textarea]');
    this.linkInput = document.querySelector('[data-link-input]');
    this.codeTextarea = document.querySelector('[data-code-textarea]');
    this.promptTextarea = document.querySelector('[data-prompt-textarea]');

    // Type selectors
    this.typeTabs = document.querySelectorAll('[data-post-type]');
    this.typeContents = document.querySelectorAll('[data-type-content]');

    // Community and tags
    this.communitySelect = document.querySelector('[data-community-select]');
    this.tagsContainer = document.querySelector('[data-tags-container]');
    this.tagInput = document.querySelector('[data-tag-input]');

    // Preview and actions
    this.previewContainer = document.querySelector('[data-preview-container]');
    this.previewToggle = document.querySelector('[data-preview-toggle]');
    this.submitButton = document.querySelector('[data-submit-post]');
    this.saveDraftButton = document.querySelector('[data-save-draft]');

    // Character counters
    this.titleCounter = document.querySelector('[data-title-counter]');
    this.contentCounter = document.querySelector('[data-content-counter]');
  }

  setupEventListeners() {
    // Post type switching
    this.typeTabs?.forEach(tab => {
      tab.addEventListener('click', () => {
        this.switchPostType(tab.dataset.postType);
      });
    });

    // Form submission
    this.form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitPost();
    });

    // Input changes
    this.titleInput?.addEventListener('input', () => {
      this.updateCharCounter('title');
      this.markAsDirty();
      this.validateTitle();
    });

    this.contentTextarea?.addEventListener('input', () => {
      this.updateCharCounter('content');
      this.markAsDirty();
      this.validateContent();
    });

    this.linkInput?.addEventListener('input', () => {
      this.markAsDirty();
      this.validateLink();
    });

    // Community selection
    this.communitySelect?.addEventListener('change', () => {
      this.selectedCommunity = this.communitySelect.value;
      this.markAsDirty();
      this.updateCommunityRules();
    });

    // Tag management
    this.tagInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        this.addTag(this.tagInput.value);
      }
    });

    // Tag suggestions
    this.setupTagAutocomplete();

    // Preview toggle
    this.previewToggle?.addEventListener('click', () => {
      this.togglePreview();
    });

    // Save draft
    this.saveDraftButton?.addEventListener('click', () => {
      this.saveDraft();
    });

    // Image upload
    this.setupImageUpload();

    // Keyboard shortcuts
    this.setupKeyboardShortcuts();

    // Prevent accidental navigation
    window.addEventListener('beforeunload', (e) => {
      if (this.isDirty && !this.isSubmitting) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      }
    });
  }

  setupValidation() {
    // Real-time validation feedback
    const validators = {
      title: () => this.validateTitle(),
      content: () => this.validateContent(),
      link: () => this.validateLink(),
      community: () => this.validateCommunity()
    };

    // Add validation classes
    this.titleInput?.addEventListener('blur', validators.title);
    this.contentTextarea?.addEventListener('blur', validators.content);
    this.linkInput?.addEventListener('blur', validators.link);
    this.communitySelect?.addEventListener('blur', validators.community);
  }

  setupMarkdown() {
    // Configure marked
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: (code, lang) => {
        if (lang && hljs.getLanguage(lang)) {
          return hljs.highlight(code, { language: lang }).value;
        }
        return hljs.highlightAuto(code).value;
      }
    });

    // Add toolbar buttons
    this.setupMarkdownToolbar();
  }

  setupMarkdownToolbar() {
    const toolbar = document.querySelector('[data-markdown-toolbar]');
    if (!toolbar) return;

    const buttons = [
      { icon: 'B', command: 'bold', wrapper: '**' },
      { icon: 'I', command: 'italic', wrapper: '_' },
      { icon: 'S', command: 'strike', wrapper: '~~' },
      { icon: 'H', command: 'heading', prefix: '### ' },
      { icon: '•', command: 'bullet', prefix: '- ' },
      { icon: '1.', command: 'number', prefix: '1. ' },
      { icon: '"', command: 'quote', prefix: '> ' },
      { icon: '<>', command: 'code', wrapper: '`' },
      { icon: '[]', command: 'codeblock', wrapper: '```\n', wrapperEnd: '\n```' },
      { icon: '🔗', command: 'link', template: '[text](url)' },
      { icon: '📷', command: 'image', template: '![alt text](url)' },
      { icon: '📊', command: 'table', template: '| Header | Header |\n|--------|--------|\n| Cell   | Cell   |' }
    ];

    toolbar.innerHTML = buttons.map(btn => `
      <button type="button" class="toolbar-btn" data-command="${btn.command}" title="${btn.command}">
        ${btn.icon}
      </button>
    `).join('');

    // Add event listeners
    toolbar.addEventListener('click', (e) => {
      const button = e.target.closest('[data-command]');
      if (button) {
        e.preventDefault();
        const command = button.dataset.command;
        const btnConfig = buttons.find(b => b.command === command);
        this.applyMarkdownCommand(btnConfig);
      }
    });
  }

  applyMarkdownCommand(config) {
    const textarea = this.contentTextarea;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    let newText = '';
    let cursorPosition = start;

    if (config.wrapper) {
      // Wrap selection
      const wrapperEnd = config.wrapperEnd || config.wrapper;
      if (selectedText) {
        newText = text.substring(0, start) + config.wrapper + selectedText + wrapperEnd + text.substring(end);
        cursorPosition = start + config.wrapper.length + selectedText.length + wrapperEnd.length;
      } else {
        newText = text.substring(0, start) + config.wrapper + 'text' + wrapperEnd + text.substring(end);
        cursorPosition = start + config.wrapper.length;
        textarea.value = newText;
        textarea.setSelectionRange(cursorPosition, cursorPosition + 4);
        textarea.focus();
        return;
      }
    } else if (config.prefix) {
      // Add prefix to line
      const lineStart = text.lastIndexOf('\n', start - 1) + 1;
      newText = text.substring(0, lineStart) + config.prefix + text.substring(lineStart);
      cursorPosition = start + config.prefix.length;
    } else if (config.template) {
      // Insert template
      newText = text.substring(0, start) + config.template + text.substring(end);
      cursorPosition = start + config.template.length;
    }

    textarea.value = newText;
    textarea.setSelectionRange(cursorPosition, cursorPosition);
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
  }

  setupCodeEditor() {
    const codeLanguageSelect = document.querySelector('[data-code-language]');
    const codeThemeSelect = document.querySelector('[data-code-theme]');

    // Language selection
    if (codeLanguageSelect) {
      codeLanguageSelect.innerHTML = `
        <option value="">Auto-detect</option>
        ${CreatePostConfig.codeLanguages.map(lang => `
          <option value="${lang}">${lang}</option>
        `).join('')}
      `;

      codeLanguageSelect.addEventListener('change', () => {
        this.highlightCode();
      });
    }

    // Theme selection
    codeThemeSelect?.addEventListener('change', (e) => {
      this.setCodeTheme(e.target.value);
    });

    // Syntax highlighting on input
    this.codeTextarea?.addEventListener('input', () => {
      this.highlightCode();
      this.markAsDirty();
    });
  }

  highlightCode() {
    const codePreview = document.querySelector('[data-code-preview]');
    const language = document.querySelector('[data-code-language]')?.value;

    if (!codePreview || !this.codeTextarea) return;

    const code = this.codeTextarea.value;
    if (!code) {
      codePreview.innerHTML = '<span class="placeholder">Your code will appear here...</span>';
      return;
    }

    let highlighted;
    if (language && hljs.getLanguage(language)) {
      highlighted = hljs.highlight(code, { language }).value;
    } else {
      highlighted = hljs.highlightAuto(code).value;
    }

    codePreview.innerHTML = `<pre><code>${highlighted}</code></pre>`;
  }

  setCodeTheme(theme) {
    const codePreview = document.querySelector('[data-code-preview]');
    if (codePreview) {
      codePreview.dataset.theme = theme;
    }
  }

  // ===============================================================================
  // POST TYPE MANAGEMENT
  // ===============================================================================

  switchPostType(type) {
    this.postType = type;

    // Update tabs
    this.typeTabs?.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.postType === type);
    });

    // Update content panels
    this.typeContents?.forEach(content => {
      content.style.display = content.dataset.typeContent === type ? 'block' : 'none';
    });

    // Update validation
    this.updateValidation();

    // Special handling for vibe-code
    if (type === 'vibe-code') {
      this.setupVibeCode();
    }
  }

  setupVibeCode() {
    const generateButton = document.querySelector('[data-generate-code]');
    const improveButton = document.querySelector('[data-improve-code]');
    const explainButton = document.querySelector('[data-explain-code]');

    generateButton?.addEventListener('click', () => {
      this.generateCode();
    });

    improveButton?.addEventListener('click', () => {
      this.improveCode();
    });

    explainButton?.addEventListener('click', () => {
      this.explainCode();
    });
  }

  async generateCode() {
    const prompt = this.promptTextarea?.value;
    if (!prompt) {
      window.GTApp?.showToast('Please enter a prompt', { type: 'warning' });
      return;
    }

    // Show loading state
    const generateButton = document.querySelector('[data-generate-code]');
    if (generateButton) {
      generateButton.disabled = true;
      generateButton.textContent = 'Generating...';
    }

    try {
      // Mock AI code generation
      await new Promise(resolve => setTimeout(resolve, 2000));

      const generatedCode = `// Generated code based on: ${prompt}\n\nfunction example() {\n  console.log("This is AI-generated code");\n  // Implementation would go here\n  return true;\n}`;

      if (this.codeTextarea) {
        this.codeTextarea.value = generatedCode;
        this.codeTextarea.dispatchEvent(new Event('input'));
      }

      window.GTApp?.showToast('Code generated successfully', { type: 'success' });
    } catch (error) {
      console.error('Code generation failed:', error);
      window.GTApp?.showToast('Failed to generate code', { type: 'error' });
    } finally {
      if (generateButton) {
        generateButton.disabled = false;
        generateButton.textContent = 'Generate Code';
      }
    }
  }

  async improveCode() {
    const code = this.codeTextarea?.value;
    if (!code) {
      window.GTApp?.showToast('Please enter some code first', { type: 'warning' });
      return;
    }

    // Mock improvement
    window.GTApp?.showToast('Code improvement feature coming soon', { type: 'info' });
  }

  async explainCode() {
    const code = this.codeTextarea?.value;
    if (!code) {
      window.GTApp?.showToast('Please enter some code first', { type: 'warning' });
      return;
    }

    // Mock explanation
    const explanation = `This code defines a function that logs a message to the console and returns true.`;

    window.GTApp?.openModal('code-explanation', {
      title: 'Code Explanation',
      content: `<div class="code-explanation">${explanation}</div>`,
      size: 'medium'
    });
  }

  // ===============================================================================
  // TAG MANAGEMENT
  // ===============================================================================

  setupTagAutocomplete() {
    const tagSuggestions = document.querySelector('[data-tag-suggestions]');
    if (!tagSuggestions) return;

    this.tagInput?.addEventListener('input', (e) => {
      const value = e.target.value.toLowerCase().trim();

      if (value.length < 2) {
        tagSuggestions.style.display = 'none';
        return;
      }

      const suggestions = CreatePostConfig.tags.filter(tag =>
        tag.toLowerCase().includes(value) && !this.selectedTags.has(tag)
      );

      if (suggestions.length === 0) {
        tagSuggestions.style.display = 'none';
        return;
      }

      tagSuggestions.innerHTML = suggestions.map(tag => `
        <button type="button" class="tag-suggestion" data-tag="${tag}">
          ${tag}
        </button>
      `).join('');

      tagSuggestions.style.display = 'block';
    });

    // Click on suggestion
    tagSuggestions.addEventListener('click', (e) => {
      const suggestion = e.target.closest('[data-tag]');
      if (suggestion) {
        this.addTag(suggestion.dataset.tag);
        tagSuggestions.style.display = 'none';
      }
    });

    // Hide suggestions on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.tags-input-container')) {
        tagSuggestions.style.display = 'none';
      }
    });
  }

  addTag(tag) {
    const trimmedTag = tag.trim().toLowerCase();

    if (!trimmedTag) return;

    if (this.selectedTags.size >= CreatePostConfig.maxTags) {
      window.GTApp?.showToast(`Maximum ${CreatePostConfig.maxTags} tags allowed`, { type: 'warning' });
      return;
    }

    if (this.selectedTags.has(trimmedTag)) {
      window.GTApp?.showToast('Tag already added', { type: 'warning' });
      return;
    }

    this.selectedTags.add(trimmedTag);
    this.renderTags();
    this.tagInput.value = '';
    this.markAsDirty();
  }

  removeTag(tag) {
    this.selectedTags.delete(tag);
    this.renderTags();
    this.markAsDirty();
  }

  renderTags() {
    const selectedTagsContainer = document.querySelector('[data-selected-tags]');
    if (!selectedTagsContainer) return;

    selectedTagsContainer.innerHTML = Array.from(this.selectedTags).map(tag => `
      <span class="selected-tag">
        ${tag}
        <button type="button" class="remove-tag" data-remove-tag="${tag}">×</button>
      </span>
    `).join('');

    // Add remove handlers
    selectedTagsContainer.querySelectorAll('[data-remove-tag]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.removeTag(btn.dataset.removeTag);
      });
    });
  }

  // ===============================================================================
  // IMAGE UPLOAD
  // ===============================================================================

  setupImageUpload() {
    const imageInput = document.querySelector('[data-image-input]');
    const dropZone = document.querySelector('[data-image-dropzone]');

    // File input change
    imageInput?.addEventListener('change', (e) => {
      this.handleImageFiles(e.target.files);
    });

    // Drag and drop
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        this.handleImageFiles(e.dataTransfer.files);
      });
    }

    // Paste from clipboard
    document.addEventListener('paste', (e) => {
      if (this.postType === 'text' && e.clipboardData.files.length > 0) {
        this.handleImageFiles(e.clipboardData.files);
      }
    });
  }

  async handleImageFiles(files) {
    const validFiles = Array.from(files).filter(file => {
      if (!CreatePostConfig.allowedImageTypes.includes(file.type)) {
        window.GTApp?.showToast(`Invalid file type: ${file.name}`, { type: 'error' });
        return false;
      }

      if (file.size > CreatePostConfig.maxFileSize) {
        window.GTApp?.showToast(`File too large: ${file.name}`, { type: 'error' });
        return false;
      }

      return true;
    });

    if (this.uploadedImages.size + validFiles.length > CreatePostConfig.maxImages) {
      window.GTApp?.showToast(`Maximum ${CreatePostConfig.maxImages} images allowed`, { type: 'warning' });
      return;
    }

    for (const file of validFiles) {
      await this.uploadImage(file);
    }
  }

  async uploadImage(file) {
    const id = `img-${Date.now()}-${Math.random()}`;

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this.uploadedImages.set(id, {
        file,
        url: e.target.result,
        uploading: true
      });
      this.renderUploadedImages();
    };
    reader.readAsDataURL(file);

    try {
      // Mock upload
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Update status
      const image = this.uploadedImages.get(id);
      if (image) {
        image.uploading = false;
        image.uploaded = true;
        // In real app, would get URL from server
        image.serverUrl = `https://example.com/uploads/${file.name}`;
      }

      this.renderUploadedImages();
      this.markAsDirty();

      // Insert into content
      if (this.contentTextarea) {
        const markdown = `![${file.name}](${image.serverUrl})`;
        const cursorPos = this.contentTextarea.selectionStart;
        const text = this.contentTextarea.value;
        this.contentTextarea.value = text.substring(0, cursorPos) + markdown + text.substring(cursorPos);
        this.contentTextarea.dispatchEvent(new Event('input'));
      }
    } catch (error) {
      console.error('Image upload failed:', error);
      this.uploadedImages.delete(id);
      this.renderUploadedImages();
      window.GTApp?.showToast('Failed to upload image', { type: 'error' });
    }
  }

  renderUploadedImages() {
    const container = document.querySelector('[data-uploaded-images]');
    if (!container) return;

    container.innerHTML = Array.from(this.uploadedImages.entries()).map(([id, image]) => `
      <div class="uploaded-image ${image.uploading ? 'uploading' : ''}" data-image-id="${id}">
        <img src="${image.url}" alt="${image.file.name}">
        ${image.uploading ? '<div class="upload-progress"></div>' : ''}
        <button type="button" class="remove-image" data-remove-image="${id}">×</button>
      </div>
    `).join('');

    // Add remove handlers
    container.querySelectorAll('[data-remove-image]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.uploadedImages.delete(btn.dataset.removeImage);
        this.renderUploadedImages();
        this.markAsDirty();
      });
    });
  }

  // ===============================================================================
  // VALIDATION
  // ===============================================================================

  validateTitle() {
    const title = this.titleInput?.value.trim();
    const errors = [];

    if (!title) {
      errors.push('Title is required');
    } else if (title.length > CreatePostConfig.titleMaxLength) {
      errors.push(`Title must be less than ${CreatePostConfig.titleMaxLength} characters`);
    } else if (title.length < 3) {
      errors.push('Title must be at least 3 characters');
    }

    this.showFieldError('title', errors);
    return errors.length === 0;
  }

  validateContent() {
    if (this.postType !== 'text') return true;

    const content = this.contentTextarea?.value.trim();
    const errors = [];

    if (content && content.length > CreatePostConfig.contentMaxLength) {
      errors.push(`Content must be less than ${CreatePostConfig.contentMaxLength} characters`);
    }

    this.showFieldError('content', errors);
    return errors.length === 0;
  }

  validateLink() {
    if (this.postType !== 'link') return true;

    const link = this.linkInput?.value.trim();
    const errors = [];

    if (!link) {
      errors.push('Link is required');
    } else {
      try {
        const url = new URL(link);
        if (!['http:', 'https:'].includes(url.protocol)) {
          errors.push('Link must be HTTP or HTTPS');
        }
      } catch {
        errors.push('Invalid URL format');
      }
    }

    this.showFieldError('link', errors);
    return errors.length === 0;
  }

  validateCommunity() {
    const errors = [];

    if (!this.selectedCommunity) {
      errors.push('Please select a community');
    }

    this.showFieldError('community', errors);
    return errors.length === 0;
  }

  validateForm() {
    const validations = [
      this.validateTitle(),
      this.validateCommunity()
    ];

    if (this.postType === 'text') {
      validations.push(this.validateContent());
    } else if (this.postType === 'link') {
      validations.push(this.validateLink());
    } else if (this.postType === 'vibe-code') {
      const codeValid = this.codeTextarea?.value.trim() ? true : false;
      if (!codeValid) {
        this.showFieldError('code', ['Code is required']);
      }
      validations.push(codeValid);
    }

    return validations.every(v => v === true);
  }

  showFieldError(field, errors) {
    const errorContainer = document.querySelector(`[data-error-${field}]`);
    if (!errorContainer) return;

    if (errors.length === 0) {
      errorContainer.textContent = '';
      errorContainer.style.display = 'none';
    } else {
      errorContainer.textContent = errors[0];
      errorContainer.style.display = 'block';
    }
  }

  updateValidation() {
    // Re-validate all fields when type changes
    this.validateTitle();
    this.validateCommunity();

    if (this.postType === 'text') {
      this.validateContent();
    } else if (this.postType === 'link') {
      this.validateLink();
    }
  }

  // ===============================================================================
  // PREVIEW
  // ===============================================================================

  togglePreview() {
    const isPreviewVisible = this.previewContainer?.style.display !== 'none';

    if (isPreviewVisible) {
      this.hidePreview();
    } else {
      this.showPreview();
    }
  }

  showPreview() {
    if (!this.previewContainer) return;

    const postData = this.getPostData();

    const previewHTML = `
      <div class="post-preview">
        <div class="preview-header">
          <h3>Preview</h3>
          <button type="button" class="close-preview" data-close-preview>×</button>
        </div>

        <article class="post-card">
          <div class="post-header">
            <div class="post-meta">
              <a class="post-community">r/${this.getComm
ityName()}</a>
              <span class="separator">•</span>
              <span class="post-author">Posted by <a>u/current_user</a></span>
              <span class="separator">•</span>
              <time>just now</time>
            </div>
          </div>

          <h2 class="post-title">${postData.title || 'Untitled Post'}</h2>

          ${postData.tags.length > 0 ? `
            <div class="post-tags">
              ${postData.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
            </div>
          ` : ''}

          ${this.postType === 'text' && postData.content ? `
            <div class="post-content markdown-body">
              ${marked.parse(postData.content)}
            </div>
          ` : ''}

          ${this.postType === 'link' && postData.link ? `
            <div class="post-link">
              <a href="${postData.link}" target="_blank">
                <span class="link-icon">🔗</span>
                <span class="link-text">${this.extractDomain(postData.link)}</span>
              </a>
            </div>
          ` : ''}

          ${this.postType === 'vibe-code' && postData.code ? `
            <div class="post-vibe-code">
              <div class="vibe-code-badge">
                <span class="badge-icon">🤖</span>
                <span class="badge-text">AI Vibe-Code</span>
              </div>
              ${postData.prompt ? `
                <div class="vibe-prompt">
                  <strong>Prompt:</strong> ${postData.prompt}
                </div>
              ` : ''}
              <pre><code>${hljs.highlightAuto(postData.code).value}</code></pre>
            </div>
          ` : ''}
        </article>
      </div>
    `;

    this.previewContainer.innerHTML = previewHTML;
    this.previewContainer.style.display = 'block';

    // Close button
    this.previewContainer.querySelector('[data-close-preview]')?.addEventListener('click', () => {
      this.hidePreview();
    });

    // Highlight code blocks
    this.previewContainer.querySelectorAll('pre code').forEach(block => {
      hljs.highlightElement(block);
    });
  }

  hidePreview() {
    if (this.previewContainer) {
      this.previewContainer.style.display = 'none';
    }
  }

  getCommunityName() {
    const community = CreatePostConfig.communities.find(c => c.id === this.selectedCommunity);
    return community?.name || 'Select Community';
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  // ===============================================================================
  // DRAFT MANAGEMENT
  // ===============================================================================

  saveDraft() {
    const draft = this.getPostData();
    draft.savedAt = new Date().toISOString();

    try {
      localStorage.setItem(CreatePostConfig.draftKey, JSON.stringify(draft));
      window.GTApp?.showToast('Draft saved', { type: 'success' });
      this.isDirty = false;
    } catch (error) {
      console.error('Failed to save draft:', error);
      window.GTApp?.showToast('Failed to save draft', { type: 'error' });
    }
  }

  loadDraft() {
    try {
      const savedDraft = localStorage.getItem(CreatePostConfig.draftKey);
      if (!savedDraft) return;

      const draft = JSON.parse(savedDraft);

      // Show notification about loaded draft
      window.GTApp?.showToast(`Draft loaded from ${window.GTApp?.Utils.timeAgo(draft.savedAt)}`, {
        type: 'info',
        action: {
          label: 'Discard',
          callback: () => this.discardDraft()
        }
      });

      // Restore form data
      if (this.titleInput) this.titleInput.value = draft.title || '';
      if (this.contentTextarea) this.contentTextarea.value = draft.content || '';
      if (this.linkInput) this.linkInput.value = draft.link || '';
      if (this.codeTextarea) this.codeTextarea.value = draft.code || '';
      if (this.promptTextarea) this.promptTextarea.value = draft.prompt || '';
      if (this.communitySelect) this.communitySelect.value = draft.community || '';

      // Restore post type
      if (draft.type) {
        this.switchPostType(draft.type);
      }

      // Restore tags
      if (draft.tags && draft.tags.length > 0) {
        draft.tags.forEach(tag => this.selectedTags.add(tag));
        this.renderTags();
      }

      // Update counters
      this.updateCharCounter('title');
      this.updateCharCounter('content');

      // Update community
      this.selectedCommunity = draft.community;
      this.updateCommunityRules();

    } catch (error) {
      console.error('Failed to load draft:', error);
    }
  }

  discardDraft() {
    localStorage.removeItem(CreatePostConfig.draftKey);
    this.clearForm();
    window.GTApp?.showToast('Draft discarded', { type: 'info' });
  }

  setupAutoSave() {
    // Auto-save every 30 seconds if dirty
    this.autoSaveTimer = setInterval(() => {
      if (this.isDirty) {
        this.saveDraft();
      }
    }, CreatePostConfig.autoSaveInterval);
  }

  markAsDirty() {
    this.isDirty = true;
  }

  // ===============================================================================
  // FORM SUBMISSION
  // ===============================================================================

  async submitPost() {
    // Validate form
    if (!this.validateForm()) {
      window.GTApp?.showToast('Please fix the errors before submitting', { type: 'error' });
      return;
    }

    // Disable submit button
    if (this.submitButton) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = 'Submitting...';
    }

    this.isSubmitting = true;

    try {
      const postData = this.getPostData();

      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock response
      const response = {
        success: true,
        postId: `post-${Date.now()}`,
        community: postData.community
      };

      // Clear draft
      localStorage.removeItem(CreatePostConfig.draftKey);
      this.isDirty = false;

      // Show success message
      window.GTApp?.showToast('Post submitted successfully!', {
        type: 'success',
        action: {
          label: 'View Post',
          callback: () => {
            window.location.href = `/c/${response.community}/post/${response.postId}`;
          }
        }
      });

      // Redirect after delay
      setTimeout(() => {
        window.location.href = `/c/${response.community}/post/${response.postId}`;
      }, 2000);

    } catch (error) {
      console.error('Failed to submit post:', error);
      window.GTApp?.showToast('Failed to submit post. Please try again.', { type: 'error' });

      // Re-enable submit button
      if (this.submitButton) {
        this.submitButton.disabled = false;
        this.submitButton.textContent = 'Submit Post';
      }
    } finally {
      this.isSubmitting = false;
    }
  }

  getPostData() {
    return {
      type: this.postType,
      title: this.titleInput?.value.trim() || '',
      content: this.contentTextarea?.value.trim() || '',
      link: this.linkInput?.value.trim() || '',
      code: this.codeTextarea?.value.trim() || '',
      prompt: this.promptTextarea?.value.trim() || '',
      community: this.selectedCommunity,
      tags: Array.from(this.selectedTags),
      images: Array.from(this.uploadedImages.values()).filter(img => img.uploaded)
    };
  }

  clearForm() {
    // Clear all inputs
    if (this.titleInput) this.titleInput.value = '';
    if (this.contentTextarea) this.contentTextarea.value = '';
    if (this.linkInput) this.linkInput.value = '';
    if (this.codeTextarea) this.codeTextarea.value = '';
    if (this.promptTextarea) this.promptTextarea.value = '';
    if (this.communitySelect) this.communitySelect.value = '';

    // Clear tags
    this.selectedTags.clear();
    this.renderTags();

    // Clear images
    this.uploadedImages.clear();
    this.renderUploadedImages();

    // Reset state
    this.selectedCommunity = null;
    this.isDirty = false;

    // Update counters
    this.updateCharCounter('title');
    this.updateCharCounter('content');
  }

  // ===============================================================================
  // UTILITIES
  // ===============================================================================

  updateCharCounter(field) {
    let input, counter, maxLength;

    if (field === 'title') {
      input = this.titleInput;
      counter = this.titleCounter;
      maxLength = CreatePostConfig.titleMaxLength;
    } else if (field === 'content') {
      input = this.contentTextarea;
      counter = this.contentCounter;
      maxLength = CreatePostConfig.contentMaxLength;
    }

    if (!input || !counter) return;

    const length = input.value.length;
    counter.textContent = `${length} / ${maxLength}`;
    counter.classList.toggle('over-limit', length > maxLength);
  }

  updateCommunityRules() {
    const rulesContainer = document.querySelector('[data-community-rules]');
    if (!rulesContainer) return;

    const community = CreatePostConfig.communities.find(c => c.id === this.selectedCommunity);

    if (!community) {
      rulesContainer.style.display = 'none';
      return;
    }

    // Mock community rules
    const rules = [
      'Be respectful and constructive',
      'No spam or self-promotion',
      'Use appropriate tags',
      'Follow Georgia Tech community guidelines'
    ];

    rulesContainer.innerHTML = `
      <h4>r/${community.name} Rules</h4>
      <ol class="community-rules">
        ${rules.map(rule => `<li>${rule}</li>`).join('')}
      </ol>
    `;
    rulesContainer.style.display = 'block';
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + Enter to submit
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        if (document.activeElement?.closest('[data-create-post-form]')) {
          e.preventDefault();
          this.submitPost();
        }
      }

      // Cmd/Ctrl + S to save draft
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (document.activeElement?.closest('[data-create-post-form]')) {
          e.preventDefault();
          this.saveDraft();
        }
      }

      // Cmd/Ctrl + P to preview
      if ((e.metaKey || e.ctrlKey) && e.key === 'p') {
        if (document.activeElement?.closest('[data-create-post-form]')) {
          e.preventDefault();
          this.togglePreview();
        }
      }
    });
  }
}

// ===============================================================================
// INITIALIZATION
// ===============================================================================

// Initialize when DOM is ready
if (document.querySelector('[data-create-post-form]')) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.createPostManager = new CreatePostManager();
    });
  } else {
    window.createPostManager = new CreatePostManager();
  }
}

// Export for ES modules
export { CreatePostManager, CreatePostConfig };