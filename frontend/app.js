/**
 * Blog Writing Agent - Frontend JavaScript
 * Handles API calls, UI state management, and interactions
 */

// ============================================================
// Configuration
// ============================================================

const API_BASE = 'http://localhost:8000';

// ============================================================
// State
// ============================================================

let currentBlogData = null;

// ============================================================
// DOM Elements
// ============================================================

const elements = {
    // Form
    generateForm: document.getElementById('generate-form'),
    topicInput: document.getElementById('topic'),
    dateInput: document.getElementById('as-of-date'),
    generateBtn: document.getElementById('generate-btn'),

    // States
    welcomeState: document.getElementById('welcome-state'),
    resultState: document.getElementById('result-state'),
    errorState: document.getElementById('error-state'),
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingStatus: document.getElementById('loading-status'),
    progressFill: document.getElementById('progress-fill'),
    errorMessage: document.getElementById('error-message'),

    // Tabs
    tabs: document.querySelectorAll('.tab'),
    tabPanes: document.querySelectorAll('.tab-pane'),

    // Plan
    planTitle: document.getElementById('plan-title'),
    planAudience: document.getElementById('plan-audience'),
    planTone: document.getElementById('plan-tone'),
    planKind: document.getElementById('plan-kind'),
    planMode: document.getElementById('plan-mode'),
    tasksGrid: document.getElementById('tasks-grid'),

    // Evidence
    evidenceContainer: document.getElementById('evidence-container'),

    // Preview
    markdownPreview: document.getElementById('markdown-preview'),

    // Download
    downloadMd: document.getElementById('download-md'),
    copyMd: document.getElementById('copy-md'),

    // Past Blogs
    pastBlogsList: document.getElementById('past-blogs-list'),
};

// ============================================================
// Initialize
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Set default date to today
    elements.dateInput.valueAsDate = new Date();

    // Setup event listeners
    setupEventListeners();

    // Load past blogs
    loadPastBlogs();

    // Configure marked.js
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true,
    });
}

function setupEventListeners() {
    // Generate form submit
    elements.generateForm.addEventListener('submit', handleGenerate);

    // Tab switching
    elements.tabs.forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });

    // Download buttons
    elements.downloadMd.addEventListener('click', handleDownloadMd);
    elements.copyMd.addEventListener('click', handleCopyMd);
}

// ============================================================
// API Functions
// ============================================================

async function generateBlog(topic, asOf) {
    const response = await fetch(`${API_BASE}/api/generate`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            topic: topic,
            as_of: asOf,
        }),
    });

    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
}

async function fetchPastBlogs() {
    try {
        const response = await fetch(`${API_BASE}/api/blogs`);
        if (!response.ok) return [];
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch past blogs:', error);
        return [];
    }
}

async function fetchBlogContent(filename) {
    const response = await fetch(`${API_BASE}/api/blogs/${encodeURIComponent(filename)}`);
    if (!response.ok) {
        throw new Error('Failed to fetch blog content');
    }
    return await response.json();
}

// ============================================================
// Event Handlers
// ============================================================

async function handleGenerate(e) {
    e.preventDefault();

    const topic = elements.topicInput.value.trim();
    if (!topic) {
        alert('Please enter a topic');
        return;
    }

    const asOf = elements.dateInput.value;

    // Show loading
    showLoading();
    updateLoadingStatus('Starting blog generation...');
    animateProgress(0);

    try {
        // Simulate progress updates
        const progressInterval = simulateProgress();

        // Call API
        const result = await generateBlog(topic, asOf);

        clearInterval(progressInterval);
        animateProgress(100);

        if (result.success) {
            currentBlogData = result;
            renderResult(result);
            showResult();

            // Refresh past blogs list
            loadPastBlogs();
        } else {
            throw new Error(result.error || 'Generation failed');
        }
    } catch (error) {
        console.error('Generation error:', error);
        showError(error.message);
    } finally {
        hideLoading();
    }
}

function handleDownloadMd() {
    if (!currentBlogData?.final_markdown) return;

    const title = currentBlogData.plan?.blog_title || 'blog';
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 50);
    const filename = `${slug}.md`;

    downloadFile(currentBlogData.final_markdown, filename, 'text/markdown');
}

function handleCopyMd() {
    if (!currentBlogData?.final_markdown) return;

    navigator.clipboard.writeText(currentBlogData.final_markdown)
        .then(() => {
            const originalText = elements.copyMd.querySelector('.download-title').textContent;
            elements.copyMd.querySelector('.download-title').textContent = 'Copied!';
            setTimeout(() => {
                elements.copyMd.querySelector('.download-title').textContent = originalText;
            }, 2000);
        })
        .catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard');
        });
}

async function handleLoadPastBlog(filename) {
    try {
        showLoading();
        updateLoadingStatus('Loading blog...');

        const data = await fetchBlogContent(filename);

        // Create a minimal result structure for display
        currentBlogData = {
            plan: null,
            evidence: [],
            final_markdown: data.content,
            image_specs: [],
            mode: '',
        };

        // Extract title from markdown
        const titleMatch = data.content.match(/^#\s+(.+)$/m);
        if (titleMatch) {
            currentBlogData.plan = {
                blog_title: titleMatch[1],
                audience: 'Unknown',
                tone: 'Unknown',
                blog_kind: 'Unknown',
                constraints: [],
                tasks: [],
            };
        }

        renderResult(currentBlogData);
        showResult();

        // Switch to preview tab for loaded blogs
        switchTab('preview');

    } catch (error) {
        console.error('Failed to load blog:', error);
        alert('Failed to load blog');
    } finally {
        hideLoading();
    }
}

// ============================================================
// UI Functions
// ============================================================

function showLoading() {
    elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    elements.loadingOverlay.classList.add('hidden');
}

function updateLoadingStatus(status) {
    elements.loadingStatus.textContent = status;
}

function animateProgress(percent) {
    elements.progressFill.style.width = `${percent}%`;
}

function simulateProgress() {
    let progress = 0;
    const stages = [
        { progress: 15, status: 'Routing request...' },
        { progress: 30, status: 'Conducting research...' },
        { progress: 50, status: 'Creating plan...' },
        { progress: 70, status: 'Writing sections...' },
        { progress: 85, status: 'Merging content...' },
        { progress: 95, status: 'Finalizing...' },
    ];

    let stageIndex = 0;

    return setInterval(() => {
        if (stageIndex < stages.length) {
            const stage = stages[stageIndex];
            if (progress < stage.progress) {
                progress += 2;
                animateProgress(progress);
            } else {
                updateLoadingStatus(stage.status);
                stageIndex++;
            }
        }
    }, 300);
}

function showWelcome() {
    elements.welcomeState.classList.remove('hidden');
    elements.resultState.classList.add('hidden');
    elements.errorState.classList.add('hidden');
}

function showResult() {
    elements.welcomeState.classList.add('hidden');
    elements.resultState.classList.remove('hidden');
    elements.errorState.classList.add('hidden');
}

function showError(message) {
    elements.welcomeState.classList.add('hidden');
    elements.resultState.classList.add('hidden');
    elements.errorState.classList.remove('hidden');
    elements.errorMessage.textContent = message;
}

function hideError() {
    showWelcome();
}

function switchTab(tabId) {
    // Update tab buttons
    elements.tabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update tab panes
    elements.tabPanes.forEach(pane => {
        pane.classList.toggle('hidden', pane.id !== `tab-${tabId}`);
        if (pane.id === `tab-${tabId}`) {
            pane.classList.add('active');
        } else {
            pane.classList.remove('active');
        }
    });
}

// ============================================================
// Render Functions
// ============================================================

function renderResult(data) {
    // Render plan
    if (data.plan) {
        elements.planTitle.textContent = data.plan.blog_title;
        elements.planAudience.textContent = data.plan.audience;
        elements.planTone.textContent = data.plan.tone;
        elements.planKind.textContent = data.plan.blog_kind;
        elements.planMode.textContent = data.mode || 'closed_book';

        renderTasks(data.plan.tasks);
    } else {
        elements.planTitle.textContent = 'Loaded Blog';
        elements.planAudience.textContent = '-';
        elements.planTone.textContent = '-';
        elements.planKind.textContent = '-';
        elements.planMode.textContent = '-';
        elements.tasksGrid.innerHTML = '<p class="empty-state">Plan not available for loaded blogs</p>';
    }

    // Render evidence
    renderEvidence(data.evidence);

    // Render markdown preview
    renderMarkdown(data.final_markdown);
}

function renderTasks(tasks) {
    if (!tasks || tasks.length === 0) {
        elements.tasksGrid.innerHTML = '<p class="empty-state">No tasks in plan</p>';
        return;
    }

    elements.tasksGrid.innerHTML = tasks.map(task => `
        <div class="task-card">
            <div class="task-header">
                <div class="task-number">${task.id}</div>
                <div class="task-title">${escapeHtml(task.title)}</div>
            </div>
            <div class="task-goal">${escapeHtml(task.goal)}</div>
            <div class="task-meta">
                <span class="task-badge">${task.target_words} words</span>
                ${task.requires_research ? '<span class="task-badge research">Research</span>' : ''}
                ${task.requires_citations ? '<span class="task-badge citations">Citations</span>' : ''}
                ${task.requires_code ? '<span class="task-badge code">Code</span>' : ''}
            </div>
            <ul class="task-bullets">
                ${task.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}
            </ul>
        </div>
    `).join('');
}

function renderEvidence(evidence) {
    if (!evidence || evidence.length === 0) {
        elements.evidenceContainer.innerHTML = '<p class="empty-state">No evidence collected (closed-book mode or no API key)</p>';
        return;
    }

    elements.evidenceContainer.innerHTML = `
        <table class="evidence-table">
            <thead>
                <tr>
                    <th>Title</th>
                    <th>Source</th>
                    <th>Date</th>
                    <th>Link</th>
                </tr>
            </thead>
            <tbody>
                ${evidence.map(e => `
                    <tr>
                        <td>${escapeHtml(e.title || '-')}</td>
                        <td>${escapeHtml(e.source || '-')}</td>
                        <td>${escapeHtml(e.published_at || '-')}</td>
                        <td><a href="${escapeHtml(e.url)}" target="_blank" rel="noopener">View</a></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function renderMarkdown(markdown) {
    if (!markdown) {
        elements.markdownPreview.innerHTML = '<p class="empty-state">No content available</p>';
        return;
    }

    try {
        elements.markdownPreview.innerHTML = marked.parse(markdown);

        // Apply syntax highlighting to code blocks
        elements.markdownPreview.querySelectorAll('pre code').forEach(block => {
            hljs.highlightElement(block);
        });
    } catch (error) {
        console.error('Markdown parsing error:', error);
        elements.markdownPreview.innerHTML = `<pre>${escapeHtml(markdown)}</pre>`;
    }
}

async function loadPastBlogs() {
    const blogs = await fetchPastBlogs();

    if (blogs.length === 0) {
        elements.pastBlogsList.innerHTML = '<p class="empty-state">No saved blogs found</p>';
        return;
    }

    elements.pastBlogsList.innerHTML = blogs.map(blog => `
        <div class="blog-item" onclick="handleLoadPastBlog('${escapeHtml(blog.filename)}')">
            <div class="blog-item-title">${escapeHtml(blog.title)}</div>
            <div class="blog-item-filename">${escapeHtml(blog.filename)}</div>
        </div>
    `).join('');
}

// ============================================================
// Utility Functions
// ============================================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Make hideError available globally for onclick
window.hideError = hideError;
window.handleLoadPastBlog = handleLoadPastBlog;
