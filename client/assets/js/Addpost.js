// Global variables
let map;
let locationMarker;
let selectedLocation = null;
let uploadedMedia = [];
let geocoder;
let selectedCategories = [];
let isEditMode = false;
let editingPostId = null;

// API Configuration
const API_BASE_URL = 'http://localhost:5000/api/v1';

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeMap();
    initializeMediaUpload();
    initializeLocationDetection();
    initializeFormSubmission();
    initializeCategoriesInput();
    checkAuthentication();
    detectEditModeAndLoad();
});

// Enhanced authentication check with token expiry handling
function checkAuthentication() {
    const token = localStorage.getItem('token');
    if (!token) {
        alert('Please login to create a post');
        window.location.href = 'login.html';
        return false;
    }
    
    // Check if token is expired (basic check)
    const tokenData = parseJwt(token);
    if (tokenData && tokenData.exp) {
        const currentTime = Date.now() / 1000;
        if (currentTime > tokenData.exp) {
            alert('Your session has expired. Please login again.');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            return false;
        }
    }
    
    return true;
}

// Helper function to parse JWT token
function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}

// Enhanced getAuthHeaders with error handling
function getAuthHeaders(expectJson = true) {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('No authentication token found');
    }

    const headers = {
        'Authorization': `Bearer ${token}`
    };

    if (expectJson) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
}

// Basic HTML escape helper used when rendering dynamic chips/text
function escapeHtml(value) {
    if (value === undefined || value === null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function detectEditModeAndLoad() {
    const params = new URLSearchParams(window.location.search);
    const pid = params.get('postId');
    if (pid) {
        isEditMode = true;
        editingPostId = pid;
        loadPostForEdit(pid).catch(err => {
            console.error('Failed to load post for editing:', err);
            const msg = (err && err.message) ? err.message : 'Could not load post for editing.';
            alert(msg);
        });
    }
}

async function loadPostForEdit(postId) {
    let res;
    try {
        res = await fetch(`${API_BASE_URL}/posts/${encodeURIComponent(postId)}`);
    } catch (e) {
        throw new Error('Network error while loading post. Ensure the server is running and CORS allows this origin.');
    }
    let json = {};
    try { json = await res.json(); } catch {}
    if (!res.ok || !json.success || !json.data) throw new Error(json.message || `Failed to load post (${res.status})`);
    const p = json.data;
    // Prefill basics
    document.getElementById('postTitle').value = p.title || '';
    document.getElementById('postContent').value = p.content || '';
    // Tags (comma-separated)
    if (Array.isArray(p.tags)) {
        document.getElementById('postTags').value = p.tags.join(', ');
    }
    // Categories chips
    if (Array.isArray(p.categories)) {
        selectedCategories = p.categories.map(c => String(c).toLowerCase());
        const chips = document.getElementById('categoriesChips');
        if (chips) {
            chips.innerHTML = '';
            selectedCategories.forEach(c => {
                const el = document.createElement('span');
                el.className = 'chip';
                el.innerHTML = `${escapeHtml(c)} <button type="button" aria-label="Remove ${escapeHtml(c)}">&times;</button>`;
                el.querySelector('button').addEventListener('click', () => {
                    selectedCategories = selectedCategories.filter(v => v !== c);
                    el.remove();
                });
                chips.appendChild(el);
            });
        }
    }
    // Media preview note: we won't auto-load existing media; user can upload a new one to replace.
    // Location: backend stores human-readable string; we won't force resetting map/location on edit.
    // Indicate edit mode on submit button
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save"></i> Save Changes';
}

// Map initialization with Geocoder
function initializeMap() {
    map = L.map('locationMap').setView([40.7128, -74.0060], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    // Initialize geocoder
    geocoder = L.Control.geocoder({
        defaultMarkGeocode: false,
        position: 'topright',
        placeholder: 'Search locations...',
        errorMessage: 'Location not found.',
        showResultIcons: true,
        collapsed: true,
        geocoder: L.Control.Geocoder.nominatim()
    })
    .on('markgeocode', function(e) {
        const { center, name, bbox } = e.geocode;
        
        // Set the location
        setPostLocation(center, name);
        
        // Fit map to the bounds if available
        if (bbox) {
            map.fitBounds(bbox);
        } else {
            map.setView(center, 15);
        }
    })
    .addTo(map);

    // Style the geocoder control to match your theme
    setTimeout(() => {
        const geocoderContainer = document.querySelector('.leaflet-control-geocoder');
        if (geocoderContainer) {
            geocoderContainer.style.background = 'var(--card-bg)';
            geocoderContainer.style.border = '1px solid var(--border)';
            geocoderContainer.style.borderRadius = '10px';
            geocoderContainer.style.backdropFilter = 'blur(10px)';
            
            const input = geocoderContainer.querySelector('input');
            if (input) {
                input.style.background = 'rgba(13, 27, 42, 0.9)';
                input.style.color = 'var(--text)';
                input.style.border = '1px solid var(--border)';
                input.style.borderRadius = '8px';
                input.placeholder = 'Search locations...';
            }

            const results = geocoderContainer.querySelector('.leaflet-control-geocoder-alternatives');
            if (results) {
                results.style.background = 'var(--card-bg)';
                results.style.border = '1px solid var(--border)';
            }
        }
    }, 100);

    map.on('click', function(e) {
        setPostLocation(e.latlng);
    });

    console.log('Map with geocoder initialized successfully');
}

// Set post location on map
function setPostLocation(latlng, placeName = null) {
    selectedLocation = latlng;
    
    if (locationMarker) {
        map.removeLayer(locationMarker);
    }
    
    locationMarker = L.marker(latlng, {
        icon: L.divIcon({
            className: 'custom-marker',
            html: '<div style="background: #00e0ff; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 15px rgba(0,224,255,0.8);"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    }).addTo(map);
    
    document.getElementById('latitude').value = latlng.lat.toFixed(6);
    document.getElementById('longitude').value = latlng.lng.toFixed(6);
    
    // Use provided place name or get from coordinates
    if (placeName) {
        document.getElementById('locationAddress').innerHTML = `<i class="fas fa-map-marker-alt"></i> ${placeName}`;
        document.getElementById('placeName').value = placeName;
    } else {
        getAddressFromCoordinates(latlng.lat, latlng.lng);
    }
    
    locationMarker.bindPopup(`
        <div style="text-align: center; padding: 10px;">
            <strong style="color: #00e0ff;">📍 Selected Location</strong><br>
            <span style="color: #666; font-size: 12px;">
                ${placeName ? placeName : `Lat: ${latlng.lat.toFixed(6)}, Lng: ${latlng.lng.toFixed(6)}`}
            </span>
        </div>
    `).openPopup();
    
    // Center map on the selected location
    map.setView(latlng, Math.max(map.getZoom(), 15));
}

// Get address from coordinates
function getAddressFromCoordinates(lat, lng) {
    const addressElement = document.getElementById('locationAddress');
    addressElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting address...';
    
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
        .then(response => response.json())
        .then(data => {
            if (data && data.display_name) {
                const address = data.display_name;
                const shortenedAddress = address.length > 80 ? 
                    address.substring(0, 80) + '...' : address;
                addressElement.innerHTML = `<i class="fas fa-map-marker-alt"></i> ${shortenedAddress}`;
                document.getElementById('placeName').value = address;
            } else {
                addressElement.innerHTML = '<i class="fas fa-map-pin"></i> Location set';
                document.getElementById('placeName').value = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            }
        })
        .catch(error => {
            console.error('Error getting address:', error);
            addressElement.innerHTML = `<i class="fas fa-map-pin"></i> Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            document.getElementById('placeName').value = `Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        });
}

// Location detection
function initializeLocationDetection() {
    const locationBtn = document.getElementById('detectLocation');
    const mapOverlay = document.getElementById('mapOverlay');
    const accuracyIndicator = document.getElementById('accuracyIndicator');
    
    locationBtn.addEventListener('click', function() {
        const originalText = locationBtn.innerHTML;
        locationBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Detecting...';
        locationBtn.disabled = true;
        mapOverlay.classList.add('active');
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    const latlng = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    if (position.coords.accuracy < 50) {
                        accuracyIndicator.classList.remove('hidden');
                    }
                    
                    setPostLocation(latlng);
                    
                    mapOverlay.classList.remove('active');
                    locationBtn.innerHTML = '<i class="fas fa-check"></i> Location Found!';
                    
                    setTimeout(() => {
                        locationBtn.innerHTML = originalText;
                        locationBtn.disabled = false;
                    }, 2000);
                },
                function(error) {
                    console.error('Error getting location:', error);
                    
                    mapOverlay.classList.remove('active');
                    locationBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Failed';
                    
                    setTimeout(() => {
                        locationBtn.innerHTML = originalText;
                        locationBtn.disabled = false;
                        alert('Unable to get your location. Please click on the map to select a location.');
                    }, 1500);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 60000
                }
            );
        } else {
            mapOverlay.classList.remove('active');
            locationBtn.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Not Supported';
            
            setTimeout(() => {
                locationBtn.innerHTML = originalText;
                locationBtn.disabled = false;
                alert('Geolocation is not supported by your browser.');
            }, 1500);
        }
    });
}

// Media upload functionality
function initializeMediaUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const mediaInput = document.getElementById('mediaInput');
    const browseBtn = document.getElementById('browseBtn');
    const mediaPreview = document.getElementById('mediaPreview');
    let latestMediaToken = null;

    browseBtn.addEventListener('click', () => {
        console.log('Browse button clicked');
        mediaInput.click();
    });

    mediaInput.addEventListener('change', handleFileSelect);

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });

    function highlight() {
        uploadArea.classList.add('dragover');
    }

    function unhighlight() {
        uploadArea.classList.remove('dragover');
    }

    uploadArea.addEventListener('drop', handleDrop, false);

    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        console.log('Files dropped:', files.length);
        handleFiles(files);
    }

    function handleFileSelect(e) {
        const files = e.target.files;
        console.log('Files selected:', files.length);
        handleFiles(files);
    }

    function handleFiles(files) {
        const fileArray = [...files];
        if (!fileArray.length) return;

        const file = fileArray[0];
        if (!validateFile(file)) {
            return;
        }

        const token = Symbol('mediaUpload');
        latestMediaToken = token;

        clearExistingMedia();
        previewFile(file, token);
    }

    function validateFile(file) {
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        const videoTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska'];
        const validTypes = [...imageTypes, ...videoTypes];

        if (!validTypes.includes(file.type)) {
            alert('Please select a JPG, PNG, GIF image or an MP4/WEBM/OGG/MOV/AVI/MKV video');
            return false;
        }

        const isVideo = file.type.startsWith('video/');
        const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;

        if (file.size > maxSize) {
            alert(isVideo ? 'Video size must be 50MB or less' : 'Image size must be 5MB or less');
            return false;
        }

        return true;
    }

    function clearExistingMedia() {
        if (uploadedMedia.length === 0) return;

        uploadedMedia.forEach(item => {
            if (item.element && item.element.parentElement) {
                item.element.remove();
            }

            if (item.isObjectUrl && item.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
        });

        uploadedMedia = [];
    }

    function previewFile(file, token) {
        const isVideo = file.type.startsWith('video/');
        const mediaItem = document.createElement('div');
        mediaItem.className = 'media-item';

        if (isVideo) {
            if (token !== latestMediaToken) {
                return;
            }
            const objectUrl = URL.createObjectURL(file);
            mediaItem.innerHTML = `
                <video src="${objectUrl}" controls playsinline preload="metadata"></video>
                <button type="button" class="remove-btn" onclick="removeMedia(this)">
                    <i class="fas fa-times"></i>
                </button>
            `;

            mediaPreview.appendChild(mediaItem);
            uploadedMedia.push({
                file,
                element: mediaItem,
                previewUrl: objectUrl,
                isObjectUrl: true
            });
            console.log('Video preview added');
        } else {
            const reader = new FileReader();

            reader.onload = function(e) {
                if (token !== latestMediaToken) {
                    return;
                }
                mediaItem.innerHTML = `
                    <img src="${e.target.result}" alt="Preview">
                    <button type="button" class="remove-btn" onclick="removeMedia(this)">
                        <i class="fas fa-times"></i>
                    </button>
                `;

                mediaPreview.appendChild(mediaItem);
                uploadedMedia.push({
                    file,
                    element: mediaItem,
                    previewUrl: e.target.result,
                    isObjectUrl: false
                });
                console.log('Image preview added');
            };

            reader.readAsDataURL(file);
        }
    }
}

// Remove media function
function removeMedia(button) {
    const mediaItem = button.parentElement;
    const index = uploadedMedia.findIndex(item => item.element === mediaItem);
    
    if (index > -1) {
        const [removed] = uploadedMedia.splice(index, 1);
        if (removed && removed.isObjectUrl && removed.previewUrl) {
            URL.revokeObjectURL(removed.previewUrl);
        }
    }
    mediaItem.remove();
    
    console.log('Media removed, remaining:', uploadedMedia.length);
}

// FIXED: Enhanced Form submission with proper location handling
function initializeFormSubmission() {
    const submitBtn = document.getElementById('submitBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');

    submitBtn.addEventListener('click', async function(e) {
        e.preventDefault();
        
        if (!checkAuthentication()) {
            return;
        }
        
        if (!validateForm()) {
            return;
        }

        loadingOverlay.classList.remove('hidden');

        try {
            const hasMedia = uploadedMedia.length > 0;
            const latitude = document.getElementById('latitude').value;
            const longitude = document.getElementById('longitude').value;
            const placeName = document.getElementById('placeName').value.trim();
            const locationLabel = placeName || document.getElementById('locationAddress').textContent.trim();

            let requestBody;
            let headers;
            const method = isEditMode ? 'PUT' : 'POST';
            const endpoint = isEditMode ? `${API_BASE_URL}/posts/${encodeURIComponent(editingPostId)}` : `${API_BASE_URL}/posts`;

            // Create proper GeoJSON location object
            const latNum = parseFloat(latitude);
            const lngNum = parseFloat(longitude);
            if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
                throw new Error('Invalid location data. Please reselect the location on the map.');
            }
            const locationData = {
                type: "Point",
                coordinates: [lngNum, latNum],
                address: locationLabel || null
            };

            // Categories
            const categoriesArray = Array.isArray(selectedCategories) ? selectedCategories : [];

            if (hasMedia) {
                const formData = new FormData();
                formData.append('title', document.getElementById('postTitle').value.trim());
                formData.append('content', document.getElementById('postContent').value.trim());
                // categories as repeated fields
                if (categoriesArray.length) {
                    categoriesArray.forEach(c => formData.append('categories', c));
                }

                // Handle tags properly
                const rawTags = document.getElementById('postTags').value.trim();
                if (rawTags) {
                    const tagsArray = rawTags.split(',').map(tag => tag.trim()).filter(tag => tag);
                    tagsArray.forEach(tag => {
                        formData.append('tags', tag);
                    });
                }

                // Append location if creating or if user changed (selectedLocation exists)
                if (!isEditMode || (isEditMode && selectedLocation)) {
                    formData.append('location', JSON.stringify(locationData));
                    if (locationLabel) {
                        formData.append('address', locationLabel);
                    }
                }

                formData.append('privacy', document.getElementById('postPrivacy').value);
                
                if (uploadedMedia.length > 0 && uploadedMedia[0].file) {
                    formData.append('media', uploadedMedia[0].file);
                }

                console.log('Submitting post with location:', locationData);
                requestBody = formData;
                headers = getAuthHeaders(false);
            } else {
                const rawTags = document.getElementById('postTags').value.trim();
                const tagsArray = rawTags ? rawTags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

                const postPayload = {
                    title: document.getElementById('postTitle').value.trim(),
                    content: document.getElementById('postContent').value.trim(),
                    categories: categoriesArray,
                    tags: tagsArray,
                    privacy: document.getElementById('postPrivacy').value
                };

                // Include location only if creating or if user picked a new one now
                if (!isEditMode || (isEditMode && selectedLocation)) {
                    postPayload.location = locationData; // Proper GeoJSON format
                    postPayload.address = locationLabel || null;
                }

                requestBody = JSON.stringify(postPayload);
                headers = getAuthHeaders(true);
            }

            const response = await fetch(endpoint, {
                method,
                headers,
                body: requestBody
            });

            // Handle authentication errors
            if (response.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                throw new Error('Session expired. Please login again.');
            }

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to create post');
            }

            loadingOverlay.classList.add('hidden');
            if (isEditMode) {
                // Redirect back to profile after successful edit
                window.location.href = 'userprofile.html';
                return;
            } else {
                showSuccessMessage(result.data);
            }
            
        } catch (error) {
            console.error('Error creating post:', error);
            loadingOverlay.classList.add('hidden');
            
            if (error.message.includes('Session expired') || error.message.includes('authentication')) {
                alert('Your session has expired. Please login again.');
                window.location.href = 'login.html';
            } else {
                showErrorMessage(error.message);
            }
        }
    });

    cancelBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to cancel? All unsaved changes will be lost.')) {
            resetForm();
        }
    });
}

// Form validation
function validateForm() {
    const title = document.getElementById('postTitle').value.trim();
    const content = document.getElementById('postContent').value.trim();
    const categoryCount = selectedCategories.length;

    if (!title) {
        alert('Please enter a post title');
        document.getElementById('postTitle').focus();
        return false;
    }

    if (!content) {
        alert('Please enter post content');
        document.getElementById('postContent').focus();
        return false;
    }

    if (!categoryCount) {
        alert('Please add at least one category');
        document.getElementById('categoriesInput').focus();
        return false;
    }

    // In edit mode, allow submitting without re-selecting location
    if (!isEditMode) {
        if (!selectedLocation) {
            alert('Please select a location for your post');
            return false;
        }
    }

    return true;
}

// Categories input with chips
function initializeCategoriesInput() {
    const input = document.getElementById('categoriesInput');
    const chips = document.getElementById('categoriesChips');
    const quick = document.querySelectorAll('.chip-btn');

    const addCategory = (val) => {
        const v = String(val || '').trim();
        if (!v) return;
        if (selectedCategories.includes(v.toLowerCase())) return;
        selectedCategories.push(v.toLowerCase());
        renderChips();
    };

    const removeCategory = (val) => {
        selectedCategories = selectedCategories.filter(c => c !== val);
        renderChips();
    };

    const renderChips = () => {
        if (!chips) return;
        chips.innerHTML = '';
        selectedCategories.forEach(c => {
            const el = document.createElement('span');
            el.className = 'chip';
            el.innerHTML = `${escapeHtml(c)} <button type="button" aria-label="Remove ${escapeHtml(c)}">&times;</button>`;
            el.querySelector('button').addEventListener('click', () => removeCategory(c));
            chips.appendChild(el);
        });
    };

    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const val = input.value;
                input.value = '';
                addCategory(val);
            } else if (e.key === 'Backspace' && !input.value && selectedCategories.length) {
                // remove last
                selectedCategories.pop();
                renderChips();
            }
        });
        input.addEventListener('blur', () => {
            if (input.value.trim()) {
                addCategory(input.value.trim());
                input.value = '';
            }
        });
    }

    quick.forEach(btn => btn.addEventListener('click', () => addCategory(btn.dataset.cat)));
}

// Show success message
function showSuccessMessage(post) {
    const successMsg = document.createElement('div');
    successMsg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(10, 22, 34, 0.95);
        padding: 40px;
        border-radius: 20px;
        text-align: center;
        border: 2px solid #00e0ff;
        box-shadow: 0 20px 50px rgba(0, 224, 255, 0.3);
        z-index: 10000;
        backdrop-filter: blur(20px);
        min-width: 300px;
    `;
    
    successMsg.innerHTML = `
        <div style="font-size: 4rem; color: #00e0ff; margin-bottom: 20px;">
            <i class="fas fa-check-circle"></i>
        </div>
        <h3 style="color: white; margin-bottom: 15px; font-size: 1.5rem;">Opportunity Published!</h3>
        <p style="color: #B0C4DE; margin-bottom: 25px;">Your post "${post.title}" has been shared successfully.</p>
        <div style="display: flex; gap: 15px; justify-content: center;">
            <button onclick="this.parentElement.parentElement.remove(); resetForm();" 
                    style="background: #00e0ff; color: #0D1B2A; border: none; padding: 12px 25px; border-radius: 25px; cursor: pointer; font-weight: 600;">
                <i class="fas fa-plus"></i> Create Another
            </button>
            <button onclick="window.location.href = 'explore.html'" 
                    style="background: transparent; color: #00e0ff; border: 2px solid #00e0ff; padding: 12px 25px; border-radius: 25px; cursor: pointer; font-weight: 600;">
                <i class="fas fa-eye"></i> View Opportunities
            </button>
        </div>
    `;
    
    document.body.appendChild(successMsg);
}

// Show error message
function showErrorMessage(message) {
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(10, 22, 34, 0.95);
        padding: 40px;
        border-radius: 20px;
        text-align: center;
        border: 2px solid #FF6B6B;
        box-shadow: 0 20px 50px rgba(255, 107, 107, 0.3);
        z-index: 10000;
        backdrop-filter: blur(20px);
        min-width: 300px;
    `;
    
    errorMsg.innerHTML = `
        <div style="font-size: 4rem; color: #FF6B6B; margin-bottom: 20px;">
            <i class="fas fa-exclamation-triangle"></i>
        </div>
        <h3 style="color: white; margin-bottom: 15px; font-size: 1.5rem;">Error</h3>
        <p style="color: #B0C4DE; margin-bottom: 25px;">${message}</p>
        <button onclick="this.parentElement.parentElement.remove()" 
                style="background: #FF6B6B; color: white; border: none; padding: 12px 25px; border-radius: 25px; cursor: pointer; font-weight: 600;">
            <i class="fas fa-times"></i> Close
        </button>
    `;
    
    document.body.appendChild(errorMsg);
}

// Reset form
function resetForm() {
    document.getElementById('postTitle').value = '';
    document.getElementById('postContent').value = '';
    document.getElementById('postCategory').value = '';
    document.getElementById('postPrivacy').value = 'public';
    document.getElementById('postTags').value = '';
    document.getElementById('placeName').value = '';
    
    document.getElementById('mediaPreview').innerHTML = '';
    uploadedMedia.forEach(item => {
        if (item && item.isObjectUrl && item.previewUrl) {
            URL.revokeObjectURL(item.previewUrl);
        }
    });
    uploadedMedia = [];
    
    if (locationMarker) {
        map.removeLayer(locationMarker);
        locationMarker = null;
    }
    selectedLocation = null;
    document.getElementById('locationAddress').innerHTML = 'Search for a location or click on the map to set position';
    document.getElementById('latitude').value = '';
    document.getElementById('longitude').value = '';
    document.getElementById('accuracyIndicator').classList.add('hidden');
    
    map.setView([40.7128, -74.0060], 13);
    
    console.log('Form reset  successfully');
}
