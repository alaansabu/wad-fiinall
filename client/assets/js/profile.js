const API_BASE_URL = 'http://localhost:5000/api/v1/profile';
const FORM_ID = 'profileForm';
const PREVIEW_WRAPPER_ID = 'previewWrapper';
const PREVIEW_IMG_ID = 'previewPic';
const MESSAGE_ID = 'message';

const selectors = {
    firstName: 'firstName',
    surname: 'surname',
    age: 'age',
    dob: 'dob',
    phone: 'phone',
    bio: 'bio',
    profilePic: 'profilePic'
};

const getEl = id => document.getElementById(id);
const getToken = () => localStorage.getItem('token');

function showMessage(text, variant = 'success') {
    const el = getEl(MESSAGE_ID);
    if (!el) return;
    el.textContent = text;
    el.className = `message ${variant}`; // Use classes for styling
    el.style.display = 'block';
}

function clearAllErrors() {
    document.querySelectorAll('.error-message').forEach(el => {
        el.textContent = '';
        el.style.display = 'none';
    });
    document.querySelectorAll('.form-field input, .form-field textarea').forEach(el => {
        el.classList.remove('invalid');
    });
}

function displayErrors(errors) {
    clearAllErrors();
    let firstErrorField = null;

    errors.forEach(err => {
        const errorEl = getEl(`${err.param}Error`);
        const fieldEl = getEl(err.param);

        if (errorEl) {
            errorEl.textContent = err.msg;
            errorEl.style.display = 'block';
        }
        if (fieldEl) {
            fieldEl.classList.add('invalid');
            if (!firstErrorField) {
                firstErrorField = fieldEl;
            }
        }
    });

    if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function previewSelectedImage(file) {
    const wrapper = getEl(PREVIEW_WRAPPER_ID);
    const img = getEl(PREVIEW_IMG_ID);
    if (!file || !wrapper || !img) return;

    const reader = new FileReader();
    reader.onload = e => {
        wrapper.classList.remove('hidden');
        img.src = e.target.result;
        img.alt = `${file.name} preview`;
    };
    reader.readAsDataURL(file);
}

function populateForm(profile) {
    getEl(selectors.firstName).value = profile.firstName || '';
    getEl(selectors.surname).value = profile.surname || '';
    getEl(selectors.age).value = profile.age || '';
    getEl(selectors.dob).value = profile.dob ? profile.dob.split('T')[0] : '';
    getEl(selectors.phone).value = profile.phone || '';
    getEl(selectors.bio).value = profile.bio || '';

    const wrapper = getEl(PREVIEW_WRAPPER_ID);
    const img = getEl(PREVIEW_IMG_ID);
    if (profile.profilePicture) {
        wrapper.classList.remove('hidden');
        img.src = `http://localhost:5000${profile.profilePicture}`;
        img.alt = `${profile.firstName || 'Profile'} preview`;
    }
}

async function fetchProfile() {
    const token = getToken();
    if (!token) {
        showMessage('Please log in to edit your profile.', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 404) {
            showMessage('No profile found. Fill in your details to create one!', 'info');
            return;
        }

        if (!response.ok) throw new Error(`Failed to load profile. Status: ${response.status}`);

        const result = await response.json();
        if (result.success && result.data) {
            populateForm(result.data);
            showMessage('Profile loaded. You can now make changes.', 'success');
        } else {
            throw new Error(result.message || 'Could not parse profile data.');
        }
    } catch (error) {
        console.error('Failed to fetch profile:', error);
        showMessage(error.message, 'error');
    }
}

async function submitProfile(event) {
    event.preventDefault();
    clearAllErrors();

    const token = getToken();
    if (!token) {
        showMessage('You must be logged in to update your profile.', 'error');
        return;
    }

    const formData = new FormData(getEl(FORM_ID));
    // Manually trim values from FormData
    for (let [key, value] of formData.entries()) {
        if (typeof value === 'string') {
            formData.set(key, value.trim());
        }
    }

    const fileInput = getEl(selectors.profilePic);
    if (fileInput && !fileInput.files[0]) {
        formData.delete('profilePicture');
    }

    showMessage('Saving profile...', 'info');

    try {
        const response = await fetch(API_BASE_URL, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });

        const result = await response.json();

        if (!response.ok) {
            if (response.status === 400 && result.errors) {
                displayErrors(result.errors);
                // The main message should be more descriptive
                showMessage('Please correct the errors highlighted below.', 'error');
            } else {
                // For other errors, show the message from the server
                showMessage(result.message || 'Failed to save profile', 'error');
            }
            // We should not proceed further if there was an error.
            return; 
        }

        showMessage('Profile saved successfully!', 'success');
        if (result.data) populateForm(result.data);
        
        setTimeout(() => {
            window.location.href = 'userprofile.html';
        }, 1500);

    } catch (error) {
        console.error('Failed to save profile:', error);
        showMessage('An unexpected error occurred. Please try again.', 'error');
    }
}

function init() {
    const form = getEl(FORM_ID);
    if (!form) return;

    const fileInput = getEl(selectors.profilePic);
    fileInput?.addEventListener('change', (event) => {
        const file = event.target.files?.[0];
        if (file) previewSelectedImage(file);
    });

    form.addEventListener('submit', submitProfile);
    fetchProfile();
}

document.addEventListener('DOMContentLoaded', init);