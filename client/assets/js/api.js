// API service for posts
class PostAPI {
    static baseURL = 'http://localhost:5000/api/v1';

    static async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const token = AuthService.getToken();
        
        const config = {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'API request failed');
            }

            return data;
        } catch (error) {
            console.error('API request failed:', error);
            throw error;
        }
    }

    // Post methods
    static async createPost(postData) {
        return this.request('/posts', {
            method: 'POST',
            body: JSON.stringify(postData)
        });
    }

    static async getPosts(page = 1, limit = 10, filters = {}) {
        const params = new URLSearchParams({ page, limit, ...filters });
        return this.request(`/posts?${params}`);
    }

    static async getPost(id) {
        return this.request(`/posts/${id}`);
    }

    static async likePost(id) {
        return this.request(`/posts/${id}/like`, {
            method: 'POST'
        });
    }

    static async addComment(postId, content) {
        return this.request(`/posts/${postId}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content })
        });
    }
}