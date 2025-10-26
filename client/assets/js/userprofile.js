const PROFILE_API_BASE = 'http://localhost:5000/api/v1/profile';
const POSTS_API_BASE = 'http://localhost:5000/api/v1/posts';

const defaultProfile = {
    firstName: 'Investor',
    surname: 'Connect',
    age: 30,
    dob: '1995-01-01',
    email: 'investor@connect.com',
    phone: '555-INVEST',
    bio: 'Add something about yourself...',
    profilePicture: 'https://via.placeholder.com/160/00e0ff/0D1B2A?text=IC',
    followers: [],
    following: []
};

const state = {
    profileUserId: null,
    currentUserId: null,
    isOwnProfile: true,
    isFollowing: false,
    posts: []
};

const dom = {};

const getToken = () => localStorage.getItem('token');

const getStoredUser = () => {
    try {
        const raw = localStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch (error) {
        console.warn('Failed to parse stored user:', error);
        return null;
    }
};

const resolveId = value => {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value._id || value.id || null;
};

function cacheDomElements() {
    dom.name = document.getElementById('profileName');
    dom.photo = document.getElementById('profilePhoto');
    dom.bio = document.getElementById('profileBio');
    dom.age = document.getElementById('profileAge');
    dom.dob = document.getElementById('profileDob');
    dom.email = document.getElementById('profileEmail');
    dom.phone = document.getElementById('profilePhone');
    dom.postCount = document.getElementById('postCount');
    dom.videoCount = document.getElementById('videoCount');
    dom.followerCount = document.getElementById('followerCount');
    dom.followingCount = document.getElementById('followingCount');
    dom.postsContainer = document.getElementById('postsContainer');
    dom.videosContainer = document.getElementById('videosContainer');
    dom.profileMessage = document.getElementById('profileMessage');
    dom.editProfileBtn = document.getElementById('editProfileBtn');
    dom.followBtn = document.getElementById('followBtn');
    dom.editBioBtn = document.getElementById('editBioBtn');
}

function showMessage(text, variant = 'info') {
    if (!dom.profileMessage) return;
    dom.profileMessage.textContent = text || '';
    dom.profileMessage.classList.remove('error', 'info', 'success');
    if (text) {
        dom.profileMessage.classList.add(variant);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
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

function resolveMediaUrl(url) {
    if (!url) return null;
    if (/^https?:/i.test(url)) return url;
    return `http://localhost:5000${url}`;
}

function renderProfile(profile) {
    const fullName = `${profile.firstName || ''} ${profile.surname || ''}`.trim() || profile.user?.name || 'Investor Connect';
    if (dom.name) dom.name.textContent = fullName;

    const bioText = profile.bio || defaultProfile.bio;
    if (dom.bio) dom.bio.textContent = `Bio: ${bioText}`;

    if (dom.age) dom.age.textContent = `Age: ${profile.age ?? '--'}`;
    if (dom.dob) {
        const dobText = profile.dob ? new Date(profile.dob).toLocaleDateString() : '--';
        dom.dob.textContent = `DOB: ${dobText}`;
    }

    const email = profile.user?.email || profile.email || '--';
    if (dom.email) dom.email.textContent = `Email: ${email}`;
    if (dom.phone) dom.phone.textContent = `Phone: ${profile.phone || '--'}`;

    const pictureUrl = resolveMediaUrl(profile.profilePicture) || defaultProfile.profilePicture;
    if (dom.photo) {
        dom.photo.src = pictureUrl;
        dom.photo.alt = `${fullName}'s profile picture`;
    }

    const followersCount = profile.followersCount ?? (Array.isArray(profile.followers) ? profile.followers.length : 0);
    const followingCount = profile.followingCount ?? (Array.isArray(profile.following) ? profile.following.length : 0);
    if (dom.followerCount) dom.followerCount.textContent = followersCount;
    if (dom.followingCount) dom.followingCount.textContent = followingCount;

    if (dom.editProfileBtn) {
        dom.editProfileBtn.classList.toggle('hidden', !state.isOwnProfile);
    }

    if (dom.followBtn) {
        const shouldShowFollow = !state.isOwnProfile && !!getToken() && !!state.profileUserId;
        if (shouldShowFollow) {
            dom.followBtn.classList.remove('hidden');
            dom.followBtn.textContent = state.isFollowing ? 'Unfollow' : 'Follow';
        } else {
            dom.followBtn.classList.add('hidden');
        }
    }

    showMessage('');
}

function createPostCard(post, { isVideo = false } = {}) {
    const card = document.createElement('div');
    card.className = isVideo ? 'profile-video-card' : 'profile-post-card';

    const imageUrl = resolveMediaUrl(post.imageUrl);
    const videoUrl = resolveMediaUrl(post.videoUrl);

    const mediaMarkup = videoUrl
        ? `<div class="post-media"><video src="${escapeHtml(videoUrl)}" controls preload="metadata"></video></div>`
        : imageUrl
        ? `<div class="post-media"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(post.title || 'Post image')}" onerror="this.style.display='none'"></div>`
        : '';

    const tagsMarkup = Array.isArray(post.tags) && post.tags.length
        ? `<div class="post-tags">${post.tags.map(tag => `<span class="post-tag">#${escapeHtml(tag)}</span>`).join('')}</div>`
        : '';

    const locationText = post.location ? (typeof post.location === 'string' ? post.location : post.location.address || '') : '';

    card.innerHTML = `
        ${mediaMarkup}
        <div class="post-title">${escapeHtml(post.title || 'Untitled Post')}</div>
        <div class="post-meta">
            <span>${formatDate(post.createdAt)}</span>
            ${locationText ? `<span><i class="fas fa-map-marker-alt" aria-hidden="true"></i> ${escapeHtml(locationText)}</span>` : ''}
        </div>
        <p>${escapeHtml(post.content || '')}</p>
        ${tagsMarkup}
    `;

    // Add delete button for own posts
    const postAuthorId = resolveId(post.author);
    const canDelete = !!state.isOwnProfile && !!state.currentUserId && !!postAuthorId && postAuthorId === state.currentUserId;
    if (canDelete) {
        const actions = document.createElement('div');
        actions.className = 'post-actions';

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'edit-post-btn';
        editBtn.type = 'button';
        editBtn.setAttribute('aria-label', 'Edit this post');
        editBtn.setAttribute('title', 'Edit post');
        editBtn.innerHTML = '<i class="fas fa-pen" aria-hidden="true"></i> <span class="label">Edit</span>';
        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = `addpost.html?postId=${encodeURIComponent(post._id)}`;
        });

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-post-btn';
        delBtn.type = 'button';
        delBtn.setAttribute('aria-label', 'Delete this post');
        delBtn.setAttribute('title', 'Delete post');
        delBtn.innerHTML = '<i class="fas fa-trash" aria-hidden="true"></i> <span class="label">Delete</span>';
        delBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const confirmDelete = window.confirm('Delete this post? This cannot be undone.');
            if (!confirmDelete) return;
            try {
                await deletePostById(post._id);
            } catch (err) {
                // handled inside deletePostById
            }
        });

        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        const mediaEl = card.querySelector('.post-media');
        if (mediaEl) {
            mediaEl.appendChild(actions);
        } else {
            card.appendChild(actions);
        }
    }

    return card;
}

function renderVideos(videoPosts) {
    if (!dom.videosContainer) return;
    dom.videosContainer.innerHTML = '';

    if (!videoPosts.length) {
        dom.videosContainer.innerHTML = '<div class="empty-state">No videos shared yet.</div>';
        return;
    }

    videoPosts.forEach(post => {
        dom.videosContainer.appendChild(createPostCard(post, { isVideo: true }));
    });
}

function renderPosts(posts) {
    if (!dom.postsContainer) return;
    dom.postsContainer.innerHTML = '';

    if (!posts.length) {
        dom.postsContainer.innerHTML = '<div class="empty-state">No posts yet. Share something to get started.</div>';
        if (dom.postCount) dom.postCount.textContent = 0;
        if (dom.videoCount) dom.videoCount.textContent = 0;
        renderVideos([]);
        return;
    }

    posts.forEach(post => {
        dom.postsContainer.appendChild(createPostCard(post));
    });

    const videoPosts = posts.filter(post => !!post.videoUrl);
    renderVideos(videoPosts);

    if (dom.postCount) dom.postCount.textContent = posts.length;
    if (dom.videoCount) dom.videoCount.textContent = videoPosts.length;
}

async function loadUserPosts(userId) {
    if (!userId) {
        renderPosts([]);
        return;
    }

    try {
        const params = new URLSearchParams({ author: userId, limit: 50 });
        const response = await fetch(`${POSTS_API_BASE}?${params}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'Failed to load posts');
        }

        state.posts = result.data || [];
        renderPosts(state.posts);
    } catch (error) {
        console.error('Failed to load posts:', error);
        showMessage(error.message || 'Unable to load posts', 'error');
        renderPosts([]);
    }
}

async function deletePostById(postId) {
    const token = getToken();
    if (!token) {
        showMessage('Please log in to delete posts.', 'error');
        throw new Error('Not authenticated');
    }

    try {
        const res = await fetch(`${POSTS_API_BASE}/${postId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || !payload.success) {
            throw new Error(payload.message || 'Failed to delete post');
        }

        // Remove from state and re-render
        state.posts = Array.isArray(state.posts) ? state.posts.filter(p => p._id !== postId) : [];
        renderPosts(state.posts);
        showMessage('Post deleted successfully', 'success');
        return true;
    } catch (error) {
        console.error('Delete post failed:', error);
        showMessage(error.message || 'Unable to delete post', 'error');
        throw error;
    }
}

async function fetchAndRenderProfile() {
    const storedUser = getStoredUser();
    if (storedUser) {
        state.currentUserId = resolveId(storedUser);
    }

    const token = getToken();
    const urlParams = new URLSearchParams(window.location.search);
    const requestedUserId = urlParams.get('userId');

    let endpoint = `${PROFILE_API_BASE}/me`;
    const headers = {};
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    if (requestedUserId) {
        endpoint = `${PROFILE_API_BASE}/user/${requestedUserId}`;
        state.profileUserId = requestedUserId;
        state.isOwnProfile = !!state.currentUserId && requestedUserId === state.currentUserId;
    } else {
        state.isOwnProfile = true;
    }

    if (!token && !requestedUserId) {
        showMessage('Please log in to view your profile.', 'error');
        renderProfile(defaultProfile);
        renderPosts([]);
        return;
    }

    try {
        const response = await fetch(endpoint, { headers });

        if (response.status === 404) {
            showMessage('No profile found. Please create one to get started.', 'info');
            renderProfile(defaultProfile);
            renderPosts([]);
            if (dom.editProfileBtn) dom.editProfileBtn.textContent = 'Create Profile';
            return;
        }

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => ({}));
            throw new Error(errorPayload.message || `Failed to load profile (${response.status})`);
        }

        const result = await response.json();
        if (!result.success || !result.data) {
            throw new Error(result.message || 'Could not load profile data');
        }

        const profileData = result.data;
        const userIdFromProfile = resolveId(profileData.user);

        if (userIdFromProfile) {
            state.profileUserId = userIdFromProfile;
            if (!state.currentUserId) {
                state.currentUserId = userIdFromProfile;
            }
            state.isOwnProfile = !!state.currentUserId && state.profileUserId === state.currentUserId;
        }

        if (Array.isArray(profileData.followers) && state.currentUserId) {
            state.isFollowing = profileData.followers.some(follower => resolveId(follower) === state.currentUserId);
        } else if (typeof profileData.isFollowing === 'boolean') {
            state.isFollowing = profileData.isFollowing;
        }

        renderProfile(profileData);
        await loadUserPosts(state.profileUserId);
    } catch (error) {
        console.error('Failed to load profile:', error);
        showMessage(error.message || 'Unable to load profile', 'error');
        renderProfile(defaultProfile);
        renderPosts([]);
    }
}

function attachTabHandlers() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const grids = document.querySelectorAll('.content-grid');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            grids.forEach(grid => grid.classList.add('hidden'));

            button.classList.add('active');
            const target = button.dataset.content;
            const targetGrid = document.getElementById(`${target}Container`);
            targetGrid?.classList.remove('hidden');
        });
    });
}

function setupEditProfileButton() {
    if (!dom.editProfileBtn) return;
    dom.editProfileBtn.addEventListener('click', () => {
        window.location.href = 'editprofile.html';
    });
}

function setupFollowButton() {
    if (!dom.followBtn) return;
    dom.followBtn.addEventListener('click', async () => {
        if (!state.profileUserId) return;
        const token = getToken();
        if (!token) {
            showMessage('Please log in to follow this profile.', 'error');
            return;
        }

        dom.followBtn.disabled = true;

        try {
            const response = await fetch(`${PROFILE_API_BASE}/user/${state.profileUserId}/follow`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Unable to update follow status');
            }

            state.isFollowing = !!result.data?.isFollowing;
            if (typeof result.data?.followersCount === 'number' && dom.followerCount) {
                dom.followerCount.textContent = result.data.followersCount;
            }

            dom.followBtn.textContent = state.isFollowing ? 'Unfollow' : 'Follow';
            showMessage(result.message || (state.isFollowing ? 'You are now following this profile.' : 'Unfollowed this profile.'), 'success');
        } catch (error) {
            console.error('Follow toggle failed:', error);
            showMessage(error.message || 'Unable to update follow status', 'error');
        } finally {
            dom.followBtn.disabled = false;
        }
    });
}

function init() {
    cacheDomElements();
    if (!dom.name) return;

    attachTabHandlers();
    setupEditProfileButton();
    setupFollowButton();
    fetchAndRenderProfile();
}

// Refresh profile when window/tab regains focus so follower counts reflect recent changes
window.addEventListener('focus', () => {
    // If profile page is showing someone (not default), refresh
    try {
        if (state && state.profileUserId) fetchAndRenderProfile();
    } catch (e) {
        // ignore
    }
});

document.addEventListener('DOMContentLoaded', init);
