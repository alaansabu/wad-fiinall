// index.js - Enhanced functionality with animations and interactions
$(function(){
    // Set current year in footer
    $('#year').text(new Date().getFullYear());

    // Navbar toggle for mobile
    $('#navToggle').on('click', function(){
        $('#navLinks').toggleClass('active');
        $(this).toggleClass('active');
    });

    // Close nav when clicking outside (mobile)
    $(document).on('click', function(e){
        if(!$(e.target).closest('.navbar').length){
            $('#navLinks').removeClass('active');
            $('#navToggle').removeClass('active');
        }
    });

    // Create floating particles
    createParticles();

    // Animate stats counter
    animateStats();

    // Testimonial slider
    initTestimonialSlider();

    // Scroll animations
    initScrollAnimations();

    // Add hover effects to feature cards
    $('.feature-card').hover(
        function() {
            $(this).find('.feature-icon').css('transform', 'scale(1.1) rotate(5deg)');
        },
        function() {
            $(this).find('.feature-icon').css('transform', 'scale(1) rotate(0deg)');
        }
    );

    // Example AJAX: check dashboard (requires server running)
    $('#navLinks .accent').on('click', function(e){
        // placeholder: don't block navigation; demonstrate how to call the API
        $.ajax({ 
            url: '/api/v1/userAuth/dashboard', 
            method: 'GET' 
        })
        .done(function(res){ 
            console.log('dashboard ->', res); 
        })
        .fail(function(xhr){ 
            console.log('dashboard request failed'); 
        });
    });
});

// Create floating particles for background
function createParticles() {
    const container = $('.particles-container');
    const particleCount = 30;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = $('<div class="particle"></div>');
        const size = Math.random() * 6 + 2;
        const posX = Math.random() * 100;
        const posY = Math.random() * 100;
        const delay = Math.random() * 15;
        const duration = 15 + Math.random() * 10;
        
        particle.css({
            width: size + 'px',
            height: size + 'px',
            left: posX + '%',
            top: posY + '%',
            opacity: Math.random() * 0.5 + 0.1,
            animationDelay: delay + 's',
            animationDuration: duration + 's'
        });
        
        container.append(particle);
    }
}

// Animate statistics counter
function animateStats() {
    const stats = $('.stat-number');
    let animated = false;
    
    $(window).on('scroll', function() {
        const statsSection = $('.hero-stats');
        const scrollPos = $(window).scrollTop();
        const statsOffset = statsSection.offset().top;
        const windowHeight = $(window).height();
        
        if (!animated && scrollPos > statsOffset - windowHeight + 200) {
            animated = true;
            stats.each(function() {
                const $this = $(this);
                const countTo = parseInt($this.attr('data-count'));
                $({ countNum: 0 }).animate({ countNum: countTo }, {
                    duration: 2000,
                    easing: 'swing',
                    step: function() {
                        $this.text(Math.floor(this.countNum));
                    },
                    complete: function() {
                        $this.text(countTo);
                    }
                });
            });
        }
    });
}

// Initialize testimonial slider
function initTestimonialSlider() {
    const testimonials = $('.testimonial');
    const dots = $('.dot');
    let currentIndex = 0;
    
    function showTestimonial(index) {
        testimonials.removeClass('active');
        dots.removeClass('active');
        
        $(testimonials[index]).addClass('active');
        $(dots[index]).addClass('active');
        currentIndex = index;
    }
    
    // Next button
    $('.next-btn').on('click', function() {
        let nextIndex = currentIndex + 1;
        if (nextIndex >= testimonials.length) nextIndex = 0;
        showTestimonial(nextIndex);
    });
    
    // Previous button
    $('.prev-btn').on('click', function() {
        let prevIndex = currentIndex - 1;
        if (prevIndex < 0) prevIndex = testimonials.length - 1;
        showTestimonial(prevIndex);
    });
    
    // Dot navigation
    dots.on('click', function() {
        const index = $(this).index();
        showTestimonial(index);
    });
    
    // Auto-advance testimonials
    setInterval(function() {
        let nextIndex = currentIndex + 1;
        if (nextIndex >= testimonials.length) nextIndex = 0;
        showTestimonial(nextIndex);
    }, 5000);
}

// Initialize scroll animations
function initScrollAnimations() {
    // Check if element is in viewport
    function isInViewport(element) {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }
    
    // Add animation class when element comes into view
    function handleScrollAnimation() {
        $('.feature-card, .step, .testimonial-content').each(function() {
            if (isInViewport(this)) {
                $(this).addClass('animate-in');
            }
        });
    }
    
    // Listen for scroll events
    $(window).on('scroll', handleScrollAnimation);
    
    // Initial check
    handleScrollAnimation();
}

// Add CSS for scroll animations
$('<style>')
    .prop('type', 'text/css')
    .html(`
        .feature-card, .step, .testimonial-content {
            opacity: 0;
            transform: translateY(30px);
            transition: opacity 0.6s ease, transform 0.6s ease;
        }
        
        .feature-card.animate-in, 
        .step.animate-in, 
        .testimonial-content.animate-in {
            opacity: 1;
            transform: translateY(0);
        }
        
        .feature-card:nth-child(1) { transition-delay: 0.1s; }
        .feature-card:nth-child(2) { transition-delay: 0.2s; }
        .feature-card:nth-child(3) { transition-delay: 0.3s; }
        
        .step:nth-child(1) { transition-delay: 0.1s; }
        .step:nth-child(2) { transition-delay: 0.2s; }
        .step:nth-child(3) { transition-delay: 0.3s; }
    `)
    .appendTo('head');