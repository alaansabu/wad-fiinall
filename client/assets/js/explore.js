// Explore Page JavaScript
class ExplorePage {
    constructor() {
        this.posts = [];
        this.currentPage = 1;
        this.hasMore = true;
        this.isLoading = false;
        this.filters = {
            location: '',
            categories: ''
        };
        this.currentPostId = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadPosts();
        this.checkAuthentication();
    }

    checkAuthentication() {
        const token = localStorage.getItem('token');
        if (!token) {
            console.warn('User not authenticated. Some features may not work.');
        }
        return !!token;
    }

    getAuthHeaders() {
        const token = localStorage.getItem('token');
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    bindEvents() {
        // Search and filter events
        document.getElementById('applyFilters').addEventListener('click', () => this.applyFilters());
        document.getElementById('clearFilters').addEventListener('click', () => this.clearFilters());
        document.getElementById('loadMoreBtn').addEventListener('click', () => this.loadMorePosts());
        
        // Meeting modal events
        document.getElementById('closeMeetingModal').addEventListener('click', () => this.closeMeetingModal());
        document.getElementById('cancelMeeting').addEventListener('click', () => this.closeMeetingModal());
        
        // Close modal on backdrop click
        document.getElementById('meetingModal').addEventListener('click', (e) => {
            if (e.target.id === 'meetingModal') this.closeMeetingModal();
        });

        // Meeting request form
        document.getElementById('meetingForm').addEventListener('submit', (e) => this.submitMeetingRequest(e));

        // Enter key support for filters
        document.getElementById('locationFilter').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.applyFilters();
        });
        document.getElementById('categoryFilter').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.applyFilters();
        });
    }

    async loadPosts() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading(true);
        try {
            // Build query parameters
            const params = {
                page: this.currentPage,
                limit: 9
            };

            // Add filters if they have values
            if (this.filters.location) params.location = this.filters.location;
            if (this.filters.categories) params.categories = this.filters.categories;

            const queryParams = new URLSearchParams(params);
            const response = await fetch(`http://localhost:5000/api/v1/posts?${queryParams}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();

            if (result.success) {
                if (this.currentPage === 1) {
                    this.posts = result.data || [];
                } else {
                    this.posts = [...this.posts, ...(result.data || [])];
                }
                
                // Handle pagination
                this.hasMore = result.data && result.data.length > 0;
                if (result.pagination) {
                    this.hasMore = this.currentPage < result.pagination.total;
                }
                
                this.renderPosts();
                this.updateLoadMoreButton();
            } else {
                throw new Error(result.message || 'Failed to load posts');
            }
        } catch (error) {
            console.error('Error loading posts:', error);
            this.showError('Failed to load posts. Please try again.');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    }

    async loadMorePosts() {
        this.currentPage++;
        await this.loadPosts();
    }

    applyFilters() {
        this.filters = {
            location: document.getElementById('locationFilter').value.trim(),
            categories: document.getElementById('categoryFilter').value.trim()
        };
        
        this.currentPage = 1;
        this.hasMore = true;
        this.loadPosts();
    }

    clearFilters() {
        document.getElementById('locationFilter').value = '';
        document.getElementById('categoryFilter').value = '';
        
        this.filters = {
            location: '',
            categories: ''
        };
        
        this.currentPage = 1;
        this.hasMore = true;
        this.loadPosts();
    }

    renderPosts() {
        const container = document.getElementById('postsContainer');
        const noResults = document.getElementById('noResults');
        
        if (!container) return;

        if (this.currentPage === 1) {
            container.innerHTML = '';
        }

        if (this.posts.length === 0 && this.currentPage === 1) {
            if (noResults) noResults.classList.remove('hidden');
            container.innerHTML = '';
            return;
        } else {
            if (noResults) noResults.classList.add('hidden');
        }

        this.posts.forEach(post => {
            const postElement = this.createPostElement(post);
            container.appendChild(postElement);
        });
    }

    createPostElement(post) {
        const postDiv = document.createElement('div');
        postDiv.className = 'post-card';
        
        // Safely handle post data
        const title = post.title || 'Untitled';
        const content = post.content || '';
        const imageUrl = post.imageUrl ? `http://localhost:5000${post.imageUrl}` : '';
        const videoUrl = post.videoUrl ? `http://localhost:5000${post.videoUrl}` : '';
    const tags = post.tags || [];
    const categories = post.categories || [];
        const author = post.author || {};
        const location = post.location || null;
        const mediaMarkup = videoUrl ? `
                <div class="post-media">
                    <video src="${videoUrl}" controls playsinline preload="metadata"></video>
                </div>
            ` : imageUrl ? `
                <div class="post-media">
                    <img src="${imageUrl}" alt="${this.escapeHtml(title)}" onerror="this.style.display='none'">
                </div>
            ` : '';
        
        postDiv.innerHTML = `
            ${mediaMarkup}
            
            <div class="post-content">
                <div class="post-header">
                    <h3 class="post-title">${this.escapeHtml(title)}</h3>
                    <div class="post-actions">
                        <button class="action-btn connect-btn" onclick="explorePage.connectUser('${post.author?._id || ''}')">
                            <i class="fas fa-user-plus"></i>
                            <span>Connect</span>
                        </button>
                        
                        <button class="action-btn meeting-btn" onclick="explorePage.requestMeeting('${post._id}')">
                            <i class="fas fa-calendar-check"></i>
                            <span>Meet</span>
                        </button>
                    </div>
                </div>
                
                <p class="post-description">${this.escapeHtml(content)}</p>
                
                ${categories.length > 0 ? `
                    <div class="post-tags">
                        ${categories.map(cat => `<span class=\"post-tag\">${this.escapeHtml(cat)}</span>`).join('')}
                    </div>
                ` : ''}

                ${tags.length > 0 ? `
                    <div class="post-tags">
                        ${tags.map(tag => `<span class="post-tag">#${this.escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
                
                <div class="post-meta">
                    <div class="post-author">
                        <div class="author-avatar">
                            ${author.name ? author.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        ${author.name ? this.escapeHtml(author.name) : 'Unknown User'}
                    </div>
                    <div class="post-date">
                        ${this.formatDate(post.createdAt)}
                    </div>
                </div>
                
                ${location ? `
                    <div class="post-location">
                        <i class="fas fa-map-marker-alt"></i>
                        <span>${this.formatLocation(location)}</span>
                    </div>
                ` : ''}
            </div>
        `;
        
        return postDiv;
    }

    async connectUser(userId) {
        if (!this.checkAuthentication()) {
            alert('Please login to connect with users');
            return;
        }

        if (!userId) {
            this.showError('Cannot connect with this user');
            return;
        }

        try {
            const response = await fetch(`http://localhost:5000/api/v1/connections/${userId}/connect`, {
                method: 'POST',
                headers: this.getAuthHeaders()
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showSuccess(result.message || 'Connection request sent successfully!');
            } else {
                throw new Error(result.message || 'Failed to send connection request');
            }
        } catch (error) {
            console.error('Error sending connection request:', error);
            this.showError(error.message || 'Failed to send connection request. Please try again.');
        }
    }

    async requestMeeting(postId) {
        if (!this.checkAuthentication()) {
            alert('Please login to request meetings');
            return;
        }

        this.currentPostId = postId;
        this.showMeetingModal();
    }

    showMeetingModal() {
        const modal = document.getElementById('meetingModal');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    closeMeetingModal() {
        const modal = document.getElementById('meetingModal');
        if (modal) {
            modal.classList.add('hidden');
        }
        const meetingForm = document.getElementById('meetingForm');
        if (meetingForm) {
            meetingForm.reset();
        }
        this.currentPostId = null;
    }

    async submitMeetingRequest(e) {
        if (e) e.preventDefault();
        
        if (!this.currentPostId) {
            this.showError('No post selected for meeting');
            return;
        }

        const date = document.getElementById('meetingDate').value;
        const time = document.getElementById('meetingTime').value;
        const message = document.getElementById('meetingMessage').value;

        if (!date || !time || !message) {
            this.showError('Please fill all meeting details');
            return;
        }

        try {
            const response = await fetch(`http://localhost:5000/api/v1/meetings/posts/${this.currentPostId}/meeting`, {
                method: 'POST',
                headers: this.getAuthHeaders(),
                body: JSON.stringify({ date, time, message })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                this.showSuccess(result.message || 'Meeting request sent successfully!');
                this.closeMeetingModal();
            } else {
                throw new Error(result.message || 'Failed to send meeting request');
            }
        } catch (error) {
            console.error('Error sending meeting request:', error);
            this.showError(error.message || 'Failed to send meeting request. Please try again.');
        }
    }

    showLoading(show) {
        const loadingSection = document.getElementById('loadingSection');
        if (loadingSection) {
            if (show) {
                loadingSection.classList.remove('hidden');
            } else {
                loadingSection.classList.add('hidden');
            }
        }
    }

    showError(message) {
        alert(`Error: ${message}`);
    }

    showSuccess(message) {
        alert(`Success: ${message}`);
    }

    updateLoadMoreButton() {
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        if (loadMoreBtn) {
            if (!this.hasMore || this.posts.length === 0) {
                loadMoreBtn.style.display = 'none';
            } else {
                loadMoreBtn.style.display = 'inline-flex';
            }
        }
    }

    escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    formatDate(dateString) {
        if (!dateString) return 'Unknown date';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }

    formatLocation(location) {
        if (typeof location === 'string') return location;
        if (location.address) return location.address;
        if (location.latitude && location.longitude) {
            return `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
        }
        return 'Location available';
    }
}

// Initialize explore page when DOM is loaded
let explorePage;
document.addEventListener('DOMContentLoaded', () => {
    explorePage = new ExplorePage();
});