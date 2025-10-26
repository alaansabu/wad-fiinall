const ChatHistory = require('../models/chatHistory');
const User = require('../models/users');
const Post = require('../models/post');

const MAX_SUGGESTIONS = 5;
const STOP_WORD_SNIPPETS = [' in ', ' on ', ' within ', ' from ', 'related to', ' about ', ' around ', ' nearby ', ' please', ' thanks', ' regarding ', ' inside ', ' with '];

const KNOWLEDGE_BASE = [
    {
        keywords: ['create post', 'add post', 'new post', 'publish post'],
        response: 'To publish a post, open Add Post from the sidebar, fill in the title and description, add any media, tags, categories, or location, then press Publish. Your post shows up on Explore and on your profile.'
    },
    {
        keywords: ['edit post', 'update post'],
        response: 'You can edit your own post from the Explore or Profile view. Open the post, choose Edit, update the details, and save. The changes are applied instantly.'
    },
    {
        keywords: ['delete post', 'remove post'],
        response: 'To remove a post you created, open it from your profile, pick Delete, and confirm. The post disappears from Explore and your followers will no longer see it.'
    },
    {
        keywords: ['schedule meeting', 'request meeting', 'book meeting'],
        response: 'Find a post or profile you are interested in, select Request Meeting, propose a time, and wait for confirmation. All pending and accepted meetings are listed in the Meetings tab.'
    },
    {
        keywords: ['connections', 'follow', 'unfollow', 'network'],
        response: 'Use Explore to find founders or startups. Select Follow to receive their updates, or use Connect to send a connection request. Accepted connections show inside your Connections tab.'
    },
    {
        keywords: ['messages', 'chat', 'dm', 'direct message'],
        response: 'Open Messages from the sidebar to start a real-time chat with your connections. If you see a new post you like, request a meeting first or follow them before messaging.'
    },
    {
        keywords: ['update profile', 'edit profile', 'change profile'],
        response: 'Go to your profile page, use Edit Profile to update your avatar, bio, skills, focus areas, and links. Save your changes to keep your profile fresh for other members.'
    },
    {
        keywords: ['notifications', 'alerts'],
        response: 'Notification badges appear in the header. They include new followers, meeting responses, and messages. Open the Notifications drop-down to mark items as read.'
    },
    {
        keywords: ['categories', 'tags', 'topics'],
        response: 'Every post can include categories and tags. Ask me for posts in a specific category or explore filters on the Explore page to narrow by topic.'
    },
    {
        keywords: ['features', 'what can you do', 'help'],
        response: 'I can guide you through creating posts, scheduling meetings, managing profiles, finding users, and exploring content by categories or location. Ask me for names, topics, or places and I will search the app data for you.'
    },
    {
        keywords: ['reset password', 'forgot password'],
        response: 'Use the Forgot Password option on the login page. We will email you a one-time password so you can reset your credentials securely.'
    },
    {
        keywords: ['email', 'verification', 'verify account'],
        response: 'After sign-up, check your inbox for the verification code. Enter it on the verification screen to activate your account and unlock all features.'
    }
];

const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
});

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const cleanQueryTerm = (term = '') => {
    let sanitized = term.replace(/[?!.]/g, '').trim();
    if (!sanitized) {
        return '';
    }

    for (const snippet of STOP_WORD_SNIPPETS) {
        const index = sanitized.toLowerCase().indexOf(snippet.trim());
        if (index > 0) {
            sanitized = sanitized.slice(0, index).trim();
        }
    }

    return sanitized.replace(/\s+/g, ' ');
};

const toBulletList = (items = []) => items.map(item => `- ${item}`).join('\n');

const levenshtein = (a = '', b = '') => {
    const matrix = Array.from({ length: b.length + 1 }, () => new Array(a.length + 1).fill(0));
    for (let i = 0; i <= a.length; i += 1) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j += 1) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j += 1) {
        for (let i = 1; i <= a.length; i += 1) {
            const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
            matrix[j][i] = Math.min(
                matrix[j - 1][i] + 1,
                matrix[j][i - 1] + 1,
                matrix[j - 1][i - 1] + cost
            );
        }
    }

    return matrix[b.length][a.length];
};

const findClosestMatch = (term, sources = []) => {
    const normalizedTerm = term.toLowerCase();
    let bestValue = '';
    let bestScore = Number.POSITIVE_INFINITY;

    for (const source of sources) {
        if (!source || typeof source !== 'string') {
            continue;
        }

        const distance = levenshtein(normalizedTerm, source.toLowerCase());
        const maxLength = Math.max(normalizedTerm.length, source.length) || 1;
        const score = distance / maxLength;

        if (score <= 0.5 && distance < bestScore) {
            bestScore = distance;
            bestValue = source;
        }
    }

    return bestValue;
};

class AIChatService {
    constructor() {
        this.externalUnavailable = false;
        this.lastApiFailure = 0;
    }

    async getAIResponse(userId, userMessage) {
        try {
            console.log(`Processing AI request for user ${userId}: ${userMessage}`);
            
            // Get or create chat history
            let chatHistory = await ChatHistory.findOne({ userId });
            if (!chatHistory) {
                chatHistory = new ChatHistory({ 
                    userId, 
                    messages: [],
                    context: {}
                });
            }

            // Add user message to history (keep last 10 messages)
            chatHistory.messages.push({ 
                role: 'user', 
                content: userMessage 
            });
            
            // Keep only last 10 messages to manage context size
            if (chatHistory.messages.length > 10) {
                chatHistory.messages = chatHistory.messages.slice(-10);
            }

            let aiResponse = null;

            let localAnswer = await this.handleLocalQuery(userMessage);
            if (localAnswer) {
                aiResponse = localAnswer;
            } else {
                aiResponse = await this.fetchExternalResponse(userMessage, chatHistory.messages);
            }

            if (!aiResponse) {
                aiResponse = this.getFallbackResponse(userMessage);
            }

            // Add AI response to history
            chatHistory.messages.push({ 
                role: 'assistant', 
                content: aiResponse 
            });
            
            await chatHistory.save();

            return aiResponse;
        } catch (error) {
            console.error('AI Service Error:', error);
            // Fallback responses
            return this.getFallbackResponse(userMessage);
        }
    }

    async fetchExternalResponse(userMessage, messageHistory) {
        const apiKey = process.env.HUGGINGFACE_API_KEY;
        if (!apiKey) {
            return null;
        }

        const cooldownMs = 5 * 60 * 1000;
        if (this.externalUnavailable && Date.now() - this.lastApiFailure < cooldownMs) {
            return null;
        }

        try {
            const external = await this.callHuggingFaceAPI(userMessage, messageHistory);
            this.externalUnavailable = false;
            return external;
        } catch (error) {
            this.externalUnavailable = true;
            this.lastApiFailure = Date.now();
            console.warn('Hugging Face API request failed:', error.message || error);
            return null;
        }
    }

    async handleLocalQuery(userMessage) {
        if (typeof userMessage !== 'string') {
            return null;
        }

        const trimmed = userMessage.trim();
        if (!trimmed) {
            return null;
        }

        const normalized = trimmed.toLowerCase();

        const dataRequests = [];

        const personName = this.extractPersonName(trimmed);
        if (personName) {
            dataRequests.push(this.answerUserLookup(personName));
        }

        const topicKeyword = this.extractTopicKeyword(trimmed);
        const locationKeyword = this.extractLocationKeyword(trimmed, normalized);

        if (topicKeyword && locationKeyword) {
            dataRequests.push(this.answerPostsByTopicAndLocation(topicKeyword, locationKeyword));
        }

        if (topicKeyword) {
            dataRequests.push(this.answerPostsByTopic(topicKeyword));
        }

        if (locationKeyword) {
            dataRequests.push(this.answerPostsByLocation(locationKeyword));
        }

        const knowledgeAnswer = this.findKnowledgeBaseAnswer(normalized);
        if (knowledgeAnswer) {
            dataRequests.push(Promise.resolve(knowledgeAnswer));
        }

        if (normalized.includes('how do i add') && normalized.includes('post')) {
            dataRequests.push(Promise.resolve('To create a post, open the Add Post page, fill in your title, description, and optional media, then publish it. You can also add categories, tags, and a location to help others discover it.'));
        }

        if (normalized.includes('how do i delete') && normalized.includes('post')) {
            dataRequests.push(Promise.resolve('Open your profile, select the post you want to remove, and use the Delete option. Confirm the dialog and the post is removed from Explore and your followers.'));
        }

        if (normalized.includes('how do i schedule') && normalized.includes('meeting')) {
            dataRequests.push(Promise.resolve('Find a post you like, then use the "Request Meeting" option. The creator will get a notification and can confirm the time. You can track all your requests from the Meetings tab.'));
        }

        if (!dataRequests.length) {
            return null;
        }

        const results = (await Promise.all(dataRequests)).filter(Boolean);

        if (!results.length) {
            return null;
        }

        const uniqueResults = Array.from(new Set(results));
        return uniqueResults.join('\n\n');
    }

    findKnowledgeBaseAnswer(normalizedText = '') {
        if (!normalizedText) {
            return '';
        }

        for (const entry of KNOWLEDGE_BASE) {
            if (!entry || !Array.isArray(entry.keywords)) {
                continue;
            }

            const matches = entry.keywords.some(keyword => {
                if (!keyword) {
                    return false;
                }
                return normalizedText.includes(keyword.toLowerCase());
            });

            if (matches && entry.response) {
                return entry.response;
            }
        }

        return '';
    }

    extractPersonName(message) {
        const patterns = [
            /(?:named|called)\s+([a-zA-Z0-9'\s.-]{2,40})/i,
            /who\s+is\s+([a-zA-Z0-9'\s.-]{2,40})/i,
            /find\s+(?:a\s+)?(?:user|person|member)\s+([a-zA-Z0-9'\s.-]{2,40})/i,
            /username\s+(?:for|of)\s+([a-zA-Z0-9'\s.-]{2,40})/i
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match?.[1]) {
                const result = cleanQueryTerm(match[1]);
                if (result && result.toLowerCase() !== 'this app') {
                    return result;
                }
            }
        }

        if (/^is\s+there\s+(?:anyone|someone|a\s+user)\s+named\s+/i.test(message)) {
            const parts = message.split(/named/i);
            if (parts[1]) {
                const result = cleanQueryTerm(parts[1]);
                if (result && result.toLowerCase() !== 'this app') {
                    return result;
                }
            }
        }

        return '';
    }

    extractTopicKeyword(message) {
        const patterns = [
            /(?:related to|about|regarding)\s+([a-zA-Z0-9'&\s-]{2,60})/i,
            /(?:category|tag|topic)\s+(?:is\s+)?([a-zA-Z0-9'&\s-]{2,60})/i,
            /(?:startup|project|post)s?\s+(?:about|for|in)\s+([a-zA-Z0-9'&\s-]{2,60})/i
        ];

        for (const pattern of patterns) {
            const match = message.match(pattern);
            if (match?.[1]) {
                const topic = cleanQueryTerm(match[1]);
                if (topic && topic.toLowerCase() !== 'this app') {
                    return topic;
                }
            }
        }

        return '';
    }

    extractLocationKeyword(message, normalized) {
        const locationIndicators = ['location', 'city', 'country', 'based', 'located', 'where', 'place'];
        const hasIndicator = locationIndicators.some(indicator => normalized.includes(indicator));
        const locationPatterns = [
            /(?:based|located)\s+(?:in|at|around)\s+([a-zA-Z0-9'\s,-]{2,60})/i,
            /(?:in|from|near|around|at)\s+([a-zA-Z0-9'\s,-]{2,60})/i
        ];

        if (!hasIndicator && !/(?:in|from|near|around|at)\s+[A-Za-z]/.test(message)) {
            return '';
        }

        for (const pattern of locationPatterns) {
            const match = message.match(pattern);
            if (match?.[1]) {
                const location = cleanQueryTerm(match[1]);
                if (location && !/^this app$/i.test(location)) {
                    return location;
                }
            }
        }

        return '';
    }

    async answerUserLookup(rawTerm) {
        const name = cleanQueryTerm(rawTerm);
        if (!name) {
            return 'I can look up members for you. Tell me the name you want me to search for and I will check who is registered.';
        }

        const regex = new RegExp(escapeRegExp(name), 'i');
        const matches = await User.find({ name: regex })
            .select('name createdAt')
            .sort({ name: 1 })
            .limit(MAX_SUGGESTIONS);

        if (!matches.length) {
            return `I could not find any members named "${name}" yet. Try checking the spelling or exploring the connections tab.`;
        }

        const summary = matches.map(user => {
            const joined = user.createdAt ? dateFormatter.format(user.createdAt) : 'recently';
            return `${user.name} (joined ${joined})`;
        });

        const extra = matches.length === MAX_SUGGESTIONS ? '\nShowing the first results I found.' : '';

        return `Yes, I found ${matches.length === 1 ? 'a member' : 'some members'} named "${name}":\n${toBulletList(summary)}${extra}\nOpen the Explore page to view their full profiles and connect.`;
    }

    async answerPostsByTopic(rawTerm) {
        const topic = cleanQueryTerm(rawTerm);
        if (!topic) {
            return '';
        }

        const regex = new RegExp(escapeRegExp(topic), 'i');
        let posts = await Post.find({
            $or: [
                { categories: regex },
                { tags: regex },
                { title: regex },
                { content: regex }
            ]
        })
            .populate('author', 'name')
            .sort({ createdAt: -1 })
            .limit(MAX_SUGGESTIONS);

        let label = topic;

        if (!posts.length) {
            const categories = await Post.distinct('categories');
            const tags = await Post.distinct('tags');
            const suggestion = findClosestMatch(topic, [...categories, ...tags]);
            if (suggestion) {
                const suggestionRegex = new RegExp(escapeRegExp(suggestion), 'i');
                posts = await Post.find({
                    $or: [
                        { categories: suggestionRegex },
                        { tags: suggestionRegex }
                    ]
                })
                    .populate('author', 'name')
                    .sort({ createdAt: -1 })
                    .limit(MAX_SUGGESTIONS);
                label = suggestion;
            }
        }

        if (!posts.length) {
            return `I could not spot any posts about "${topic}" yet. Try checking the Explore page filters or encourage someone to create a post for that topic.`;
        }

        const outline = posts.map(post => {
            const author = post.author?.name || 'Someone in the community';
            const location = post.location ? ` - ${post.location}` : '';
            const categories = Array.isArray(post.categories) && post.categories.length
                ? ` [${post.categories.slice(0, 3).join(', ')}]`
                : '';
            return `${post.title} by ${author}${location}${categories}`;
        });

        const intro = label !== topic
            ? `I could not find posts for "${topic}" but here are the closest matches for "${label}":`
            : `Here is what I found about "${label}":`;

        return `${intro}\n${toBulletList(outline)}\nCheck the Explore page for full details or to request a meeting.`;
    }

    async answerPostsByLocation(rawTerm) {
        const location = cleanQueryTerm(rawTerm);
        if (!location) {
            return '';
        }

        const regex = new RegExp(escapeRegExp(location), 'i');
        const posts = await Post.find({ location: regex })
            .populate('author', 'name')
            .sort({ createdAt: -1 })
            .limit(MAX_SUGGESTIONS);

        if (!posts.length) {
            return `I could not find any posts tagged with the location "${location}" right now. Try broadening the place or explore the map filters if available.`;
        }

        const outline = posts.map(post => {
            const author = post.author?.name || 'Someone in the community';
            const categories = Array.isArray(post.categories) && post.categories.length
                ? ` [${post.categories.slice(0, 2).join(', ')}]`
                : '';
            return `${post.title} by ${author}${categories}`;
        });

        return `These posts mention "${location}":\n${toBulletList(outline)}\nOpen Explore to see the full cards and interact with the creators.`;
    }

    async answerPostsByTopicAndLocation(rawTopic, rawLocation) {
        const topic = cleanQueryTerm(rawTopic);
        const location = cleanQueryTerm(rawLocation);

        if (!topic || !location) {
            return '';
        }

        const topicRegex = new RegExp(escapeRegExp(topic), 'i');
        const locationRegex = new RegExp(escapeRegExp(location), 'i');

        const posts = await Post.find({
            location: locationRegex,
            $or: [
                { categories: topicRegex },
                { tags: topicRegex },
                { title: topicRegex },
                { content: topicRegex }
            ]
        })
            .populate('author', 'name')
            .sort({ createdAt: -1 })
            .limit(MAX_SUGGESTIONS);

        if (!posts.length) {
            return '';
        }

        const outline = posts.map(post => {
            const author = post.author?.name || 'Someone in the community';
            return `${post.title} by ${author} - ${location}`;
        });

        return `Here is what I found for "${topic}" near "${location}":\n${toBulletList(outline)}\nTry refining your filters on Explore for more results.`;
    }

    async callHuggingFaceAPI(userMessage, messageHistory) {
        const modelId = process.env.HUGGINGFACE_MODEL || 'HuggingFaceH4/zephyr-7b-beta';
        const apiUrl = `https://api-inference.huggingface.co/models/${modelId}`;
        
        // Build conversation context
        const conversationContext = messageHistory
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');

        const prompt = `<s>[INST] You are a helpful AI assistant for a social media application. 
        The app has these features:
        - Create and manage posts with categories and tags
        - Schedule meetings with other users
        - Follow/unfollow users and build connections
        - Real-time messaging and chat
        - User profiles with avatars
        
        Keep responses concise, helpful, and focused on the app features. 
        If asked about something outside the app, politely redirect to app features.
        
        Conversation history:
        ${conversationContext}
        
        Current user question: ${userMessage} [/INST] Assistant:`;

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: prompt,
                parameters: {
                    max_new_tokens: 200,
                    temperature: 0.7,
                    top_p: 0.9,
                    do_sample: true,
                    return_full_text: false
                }
            })
        });

        const rawBody = await response.text();
        if (!response.ok) {
            let message = `Hugging Face API error: ${response.status}`;
            try {
                const parsed = JSON.parse(rawBody);
                if (parsed?.error) {
                    message += ` - ${parsed.error}`;
                }
            } catch (_) {
                if (rawBody) {
                    message += ` - ${rawBody}`;
                }
            }
            throw new Error(message);
        }

        let data;
        try {
            data = JSON.parse(rawBody);
        } catch (parseError) {
            throw new Error(`Unable to parse Hugging Face response: ${parseError.message}`);
        }
        
        if (data.error) {
            throw new Error(data.error);
        }

        // Extract the generated text
        let generatedText = data[0]?.generated_text || '';
        
        // Clean up the response
        if (generatedText.includes('Assistant:')) {
            generatedText = generatedText.split('Assistant:')[1]?.trim() || generatedText;
        }
        
        return generatedText || "I'm here to help! How can I assist you with the app today?";
    }

    getFallbackResponse(userMessage) {
        const lowerMessage = userMessage.toLowerCase();
        
        const fallbackResponses = {
            'hello': 'Hello! How can I help you with our social app today?',
            'hi': 'Hi there! Need help with posts, meetings, or profiles?',
            'help': 'I can help you with: creating posts, scheduling meetings, managing your profile, and connecting with other users.',
            'post': 'To create a post, go to the Add Post page. You can add text, categories, tags, and even location!',
            'meeting': 'You can request meetings from posts you\'re interested in. Find a post you like and click "Request Meeting".',
            'profile': 'Update your profile to add a bio, avatar, and showcase your interests.',
            'category': 'Ask me things like "Show fintech posts" or "Any health startups?" and I\'ll search categories, tags, and titles for you.',
            'location': 'You can ask me for posts in a place, for example "projects in Dubai" or "startups near London".',
            'connection': 'Open the Explore page to follow founders you like. You can also ask me to check if someone is already registered by name.',
            'default': 'I could not match that request. Try asking me to find a user, list posts by topic or location, or explain features like meetings, messaging, or profile updates.'
        };

        for (const [key, response] of Object.entries(fallbackResponses)) {
            if (lowerMessage.includes(key) && key !== 'default') {
                return response;
            }
        }
        
        return fallbackResponses.default;
    }

    async getChatHistory(userId) {
        try {
            const chatHistory = await ChatHistory.findOne({ userId })
                .select('messages')
                .sort({ 'messages.timestamp': -1 })
                .limit(50);
                
            return chatHistory?.messages || [];
        } catch (error) {
            console.error('Error getting chat history:', error);
            return [];
        }
    }

    async clearChatHistory(userId) {
        try {
            await ChatHistory.findOneAndUpdate(
                { userId },
                { $set: { messages: [] } },
                { new: true }
            );
            return true;
        } catch (error) {
            console.error('Error clearing chat history:', error);
            return false;
        }
    }
}

module.exports = new AIChatService();