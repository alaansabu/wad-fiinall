class Chatbot {
    constructor() {
        this.isOpen = false;
        this.isLoading = false;
        this.messages = [];
        this.authLocked = false;
        this.historySignature = null;
        this.lastHistoryTimestamp = null;
        this.init();
    }

    init() {
        this.createChatbot();
        this.bindEvents();
        this.checkAuthStatus();
        this.setupAuthListener();
    }

    createChatbot() {
        // Chatbot is already in HTML, just get references
        this.toggleBtn = document.getElementById('chatbotToggle');
        this.widget = document.getElementById('chatbotWidget');
        this.closeBtn = document.getElementById('chatbotClose');
        this.messagesContainer = document.getElementById('chatbotMessages');
        this.input = document.getElementById('chatbotInput');
        this.sendBtn = document.getElementById('sendBtn');
        
        console.log('Chatbot initialized');
    }

    bindEvents() {
        // Toggle chat
        this.toggleBtn.addEventListener('click', () => this.toggleChat());
        
        // Close button
        this.closeBtn.addEventListener('click', () => this.closeChat());
        
        // Send message
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        
        // Enter key
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !this.isLoading) {
                this.sendMessage();
            }
        });

        // Input validation
        this.input.addEventListener('input', () => {
            this.sendBtn.disabled = !this.input.value.trim() || this.isLoading;
        });

        // Quick questions
        document.querySelectorAll('.quick-question').forEach(button => {
            button.addEventListener('click', (e) => {
                const question = e.target.getAttribute('data-question');
                this.input.value = question;
                this.sendMessage();
            });
        });

        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.closeChat();
            }
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && 
                !this.widget.contains(e.target) && 
                !this.toggleBtn.contains(e.target)) {
                this.closeChat();
            }
        });
    }

    setupAuthListener() {
        // Listen for storage events (login/logout from other tabs)
        window.addEventListener('storage', (e) => {
            if (e.key === 'token') {
                this.checkAuthStatus();
            }
        });

        // Check auth status periodically
        setInterval(() => {
            this.checkAuthStatus();
        }, 3000);
    }

    checkAuthStatus() {
        const token = localStorage.getItem('token');
        const isAuthenticated = !!token;
        
        if (isAuthenticated) {
            this.authLocked = false;
            this.toggleBtn.style.display = this.isOpen ? 'none' : 'flex';
            this.input.disabled = false;
            this.sendBtn.disabled = !this.input.value.trim();
            this.loadChatHistory();
        } else {
            this.toggleBtn.style.display = this.isOpen ? 'none' : 'flex';
            this.input.disabled = true;
            this.sendBtn.disabled = true;
            this.displayAuthPrompt();
        }
    }

    toggleChat() {
        this.isOpen = !this.isOpen;
        
        if (this.isOpen) {
            this.widget.classList.add('active');
            this.toggleBtn.classList.add('hidden');
            document.body.classList.add('chatbot-open');
            this.input.focus();
            this.scrollToBottom();
        } else {
            this.closeChat();
        }
    }

    closeChat() {
        this.isOpen = false;
    this.widget.classList.remove('active');
    this.toggleBtn.classList.remove('hidden');
    document.body.classList.remove('chatbot-open');
    }

    addMessage(content, isUser = false, persist = true) {
        // Remove welcome message if it's the first user message
        const welcomeMessage = this.messagesContainer.querySelector('.welcome-message');
        if (welcomeMessage && isUser) {
            welcomeMessage.remove();
        }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isUser ? 'user' : 'assistant'}`;
    messageDiv.innerHTML = this.formatMessageContent(content);
        
        this.messagesContainer.appendChild(messageDiv);
        if (persist) {
            this.messages.push({
                role: isUser ? 'user' : 'assistant',
                content: content,
                timestamp: new Date().toISOString()
            });
        }
        
        this.scrollToBottom();
        if (persist) {
            this.saveChatHistory();
        }
    }

    formatMessageContent(content) {
        const safe = this.escapeHtml(String(content ?? ''));
        return safe.replace(/\n/g, '<br>');
    }

    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m] || m);
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    async sendMessage() {
        const message = this.input.value.trim();
        
        if (!message || this.isLoading) return;
        
        // Add user message
        this.addMessage(message, true);
        this.input.value = '';
        this.sendBtn.disabled = true;
        this.isLoading = true;
        
        // Show typing indicator
        this.showTyping();
        
        try {
            const response = await this.getAIResponse(message);
            this.hideTyping();
            if (response) {
                this.addMessage(response);
            }
        } catch (error) {
            console.error('Chat error:', error);
            this.hideTyping();

            if (error?.code === 'AUTH_REQUIRED') {
                this.addMessage('Your session expired. Please log in again to continue chatting.');
                localStorage.removeItem('token');
                this.authLocked = true;
                this.checkAuthStatus();
                return;
            }

            if (error?.code === 'NETWORK_OFFLINE') {
                this.addMessage('It looks like you are offline. Please check your connection and try again.');
                return;
            }

            this.addMessage("I'm having trouble connecting right now. Please check your internet connection and try again.");
        } finally {
            this.isLoading = false;
            this.sendBtn.disabled = !this.input.value.trim();
        }
    }

    async getAIResponse(message) {
        const token = localStorage.getItem('token');
        
        if (!token) {
            this.showNotification('Please log in to use the AI assistant');
            const authError = new Error('AUTH_REQUIRED');
            authError.code = 'AUTH_REQUIRED';
            throw authError;
        }

        if (!navigator.onLine) {
            const offlineError = new Error('NETWORK_OFFLINE');
            offlineError.code = 'NETWORK_OFFLINE';
            throw offlineError;
        }

        const response = await fetch('/api/v1/chatbot/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message })
        });

        if (response.status === 401) {
            this.showNotification('Your session expired. Please log in again.');
            const authError = new Error('AUTH_REQUIRED');
            authError.code = 'AUTH_REQUIRED';
            throw authError;
        }

        if (!response.ok) {
            const apiError = new Error(`API error: ${response.status}`);
            apiError.code = 'API_ERROR';
            throw apiError;
        }

        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.message || 'API request failed');
        }

        if (!data.response) {
            const offlineError = new Error('NETWORK_OFFLINE');
            offlineError.code = 'NETWORK_OFFLINE';
            throw offlineError;
        }

        return data.response;
    }

    showTyping() {
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message assistant typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = 'Thinking<span class="typing-dots"></span>';
        this.messagesContainer.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTyping() {
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'chatbot-notification';
        notification.innerHTML = `
            <i class="fas fa-info-circle"></i>
            ${message}
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    saveChatHistory() {
        const token = localStorage.getItem('token');
        if (token) {
            const lastUpdated = new Date().toISOString();
            const history = {
                messages: this.messages,
                lastUpdated
            };
            localStorage.setItem('chatbot_history', JSON.stringify(history));
            this.historySignature = JSON.stringify(this.messages);
            this.lastHistoryTimestamp = lastUpdated;
        }
    }

    loadChatHistory() {
        try {
            const saved = localStorage.getItem('chatbot_history');
            if (saved) {
                const history = JSON.parse(saved);
                const storedMessages = Array.isArray(history.messages) ? history.messages : [];
                const signature = JSON.stringify(storedMessages);

                if (signature === this.historySignature) {
                    return;
                }

                this.messages = storedMessages;
                this.historySignature = signature;
                this.lastHistoryTimestamp = history?.lastUpdated || null;

                if (this.messages.length > 0) {
                    this.messagesContainer.innerHTML = '';
                    this.messages.forEach(msg => {
                        this.addMessage(msg.content, msg.role === 'user', false);
                    });
                    this.scrollToBottom();
                } else {
                    this.clearMessages();
                }
            } else {
                this.clearMessages();
            }
        } catch (error) {
            console.error('Error loading chat history:', error);
            this.messages = [];
            this.clearMessages();
        }
    }

    clearMessages() {
        this.messages = [];
        this.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-robot"></i>
                </div>
                <h4>Hello! I'm your AI Assistant</h4>
                <p>I can help you with posts, meetings, profiles, and connections. How can I assist you today?</p>
                <div class="quick-questions">
                    <button class="quick-question" data-question="How do I create a post?">
                        How to create a post?
                    </button>
                    <button class="quick-question" data-question="How do I schedule a meeting?">
                        Schedule a meeting
                    </button>
                    <button class="quick-question" data-question="How do I update my profile?">
                        Update profile
                    </button>
                </div>
            </div>
        `;
        
        // Rebind quick question events
        document.querySelectorAll('.quick-question').forEach(button => {
            button.addEventListener('click', (e) => {
                const question = e.target.getAttribute('data-question');
                this.input.value = question;
                this.sendMessage();
            });
        });
        
        localStorage.removeItem('chatbot_history');
        this.historySignature = null;
        this.lastHistoryTimestamp = null;
    }

    displayAuthPrompt() {
        this.messages = [];
        this.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">
                    <i class="fas fa-lock"></i>
                </div>
                <h4>Log in to use the AI Assistant</h4>
                <p>Sign in to your account to chat about posts, meetings, and profiles.</p>
                <div class="quick-questions">
                    <button class="quick-question auth-login-btn">Go to login</button>
                </div>
            </div>
        `;

        const loginBtn = this.messagesContainer.querySelector('.auth-login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', () => {
                window.location.href = 'login.html';
            });
        }

        this.historySignature = null;
        this.lastHistoryTimestamp = null;
    }

    // Public methods
    open() {
        this.toggleChat();
    }

    close() {
        this.closeChat();
    }

    isAuthenticated() {
        return !!localStorage.getItem('token');
    }
}

// Initialize chatbot when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.Chatbot = new Chatbot();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', function() {
    if (!document.hidden && window.Chatbot) {
        window.Chatbot.checkAuthStatus();
    }
});