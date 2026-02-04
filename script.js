const API_URL = "https://script.google.com/macros/s/AKfycbw2FGCj-jHTYXi_aFSPft6iGmAC8LfpekLvPYCQ-IceKEQL5nFAyMg0SvVv7tF_B6LW/exec";

// Global State
let currentDate = new Date();
let bookedDates = []; // Format: "YYYY-MM-DD"
let bookingsMap = {}; // Format: { "YYYY-MM-DD": "Booker Name" }

document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the admin page
    if (window.location.pathname.includes('admin.html')) {
        initAdmin();
    } else if (window.location.pathname.includes('booking.html')) {
        initBookingPage();
    } else {
        // Background sync on other pages (Home/Gallery)
        fetchBookedDates(true); // true = silent mode
        initQuickViewSlider(); // Initialize Slider on Home
        initReviews(); // Initialize Reviews
    }
});

/* ===========================
   Booking Page Logic
   =========================== */
async function initBookingPage() {
    const calendarGrid = document.getElementById('calendarGrid');
    if (!calendarGrid) return; // Safety check

    // Visual Feedback: Syncing State
    calendarGrid.innerHTML = '';
    renderCalendarHeaders(); // Keep headers visible

    // Fast Load from Cache
    const cached = localStorage.getItem('bookingData');
    if (cached) {
        processBookingData(JSON.parse(cached));
        renderCalendar(currentDate);
    } else {
        // Show loader only if no cache
        const loader = document.createElement('div');
        loader.id = 'calendarLoader';
        loader.style.cssText = "grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--primary-color); font-weight: 600;";
        loader.innerHTML = '<div class="spinner"></div> Syncing data...';
        calendarGrid.appendChild(loader);
    }

    // Fetch fresh data in background
    await fetchBookedDates();

    // Remove loader if it exists
    const loader = document.getElementById('calendarLoader');
    if (loader) loader.remove();

    // Re-render with fresh data always
    renderCalendar(currentDate);

    // Event Listeners for Month Navigation
    // Use onclick to avoid duplicate listeners if re-initialized
    document.getElementById('prevMonth').onclick = () => {
        currentDate.setDate(1); // Fixes Jan 31 -> Mar bug
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar(currentDate);
    };

    document.getElementById('nextMonth').onclick = () => {
        currentDate.setDate(1);
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar(currentDate);
    };

    // Modal Events
    setupModal();
}

function renderCalendarHeaders() {
    const grid = document.getElementById('calendarGrid');
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    days.forEach(day => {
        const div = document.createElement('div');
        div.className = 'weekday-header';
        div.innerText = day;
        grid.appendChild(div);
    });
}

function renderCalendar(date) {
    const grid = document.getElementById('calendarGrid');
    const display = document.getElementById('currentMonthDisplay');

    // Clear previous days
    grid.innerHTML = '';
    renderCalendarHeaders();

    const year = date.getFullYear();
    const month = date.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    display.innerText = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay(); // 0 = Sunday

    // Today for comparison (strip time)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Padding for days before the 1st
    for (let i = 0; i < startingDay; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty-slot';
        grid.appendChild(empty);
    }

    // Days
    for (let i = 1; i <= daysInMonth; i++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.innerText = i;

        // Format date string YYYY-MM-DD
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        dayDiv.dataset.date = dateStr;

        // Date object for logic
        const cellDate = new Date(year, month, i);

        // Logic Hierarchy:
        // 1. Booked (Red) - takes precedence
        // 2. Past (Gray)
        // 3. Available (Green)
        if (bookingsMap[dateStr]) {
            dayDiv.classList.add('booked');
            dayDiv.title = `Booked by ${bookingsMap[dateStr]}`;
            dayDiv.onclick = () => alert(`This date is booked by: ${bookingsMap[dateStr]}`);
        } else if (cellDate < today) {
            dayDiv.classList.add('past');
            dayDiv.title = "Past Date";
        } else {
            dayDiv.classList.add('available');
            dayDiv.onclick = () => openBookingModal(dateStr);
        }

        grid.appendChild(dayDiv);
    }
}

/* ===========================
   API Integration Logic
   =========================== */
async function fetchBookedDates(silent = false) {
    try {
        if (!silent) console.log("Fetching full booking details...");
        const response = await fetch(API_URL + '?action=get_bookings');
        const data = await response.json();

        if (data.success && data.bookings) {
            // Save to cache
            localStorage.setItem('bookingData', JSON.stringify(data.bookings));
            processBookingData(data.bookings);
        }
    } catch (error) {
        console.error("Error fetching bookings:", error);
    }
}

function processBookingData(bookings) {
    bookingsMap = {}; // Reset
    bookedDates = [];

    bookings.forEach(b => {
        const dateKey = b.booked_date || b.date;
        const name = b.full_name || b.name || "Unknown";
        if (dateKey) {
            const d = new Date(dateKey).toISOString().split('T')[0];
            bookedDates.push(d);
            bookingsMap[d] = name;
        }
    });
}

function setupModal() {
    const modal = document.getElementById('bookingModal');
    const closeBtn = document.querySelector('.close-btn');
    const form = document.getElementById('bookingForm');

    closeBtn.onclick = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.style.display = "none", 300);
    };

    window.onclick = (event) => {
        if (event.target == modal) {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = "none", 300);
        }
    };

    form.onsubmit = async (e) => {
        e.preventDefault();
        await submitBooking();
    };
}

function openBookingModal(dateStr) {
    const modal = document.getElementById('bookingModal');
    document.getElementById('bookingDate').value = dateStr;
    modal.style.display = "flex";
    // Trigger reflow
    void modal.offsetWidth;
    modal.classList.add('show');
}

function showBookedDetails(dateStr) {
    alert(`This date (${dateStr}) is already booked!`);
}

async function submitBooking() {
    const btn = document.querySelector('#bookingForm button[type="submit"]');
    const originalText = btn.innerText;
    btn.innerText = "Processing...";
    btn.disabled = true;

    // Payload matching Google Apps Script doPost keys
    const data = {
        action: 'book',
        booked_date: document.getElementById('bookingDate').value,
        full_name: document.getElementById('fullName').value,
        mo_number: "'" + document.getElementById('mobile').value, // Add quote for sheet string format if desired
        location: document.getElementById('location').value
    };

    try {
        // Send as POST JSON
        // Note: Google Apps Script Web App must be deployed as "Anyone" for this to work without CORS issues
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify(data)
        });

        // Try to parse JSON. If CORS opaque, this might fail or return empty.
        // If script is correct, it returns JSON.
        const result = await response.json();

        if (result.success) {
            showToast("Booking Successful!");

            // Optimistic update
            bookedDates.push(data.booked_date);
            if (data.booked_date) bookingsMap[data.booked_date] = data.full_name || "You";

            // Re-render
            renderCalendar(currentDate);

            // Close modal
            document.getElementById('bookingModal').classList.remove('show');
            setTimeout(() => document.getElementById('bookingModal').style.display = "none", 300);
            document.getElementById('bookingForm').reset();
        } else {
            alert("Booking failed: " + (result.message || "Unknown error"));
        }

    } catch (error) {
        console.error("Booking Error:", error);
        // Fallback: If network error or CORS opaque response that prohibits reading
        // but the request was actually sent.
        alert("Booking request sent! Note: If you don't see the date red immediately, please refresh.");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function showToast(message) {
    const x = document.getElementById("toast");
    if (!x) return;
    x.innerText = message;
    x.style.visibility = "visible";
    setTimeout(function () { x.style.visibility = "hidden"; }, 3000);
}

/* ===========================
   Admin & User Portal Logic
   =========================== */
function initAdmin() {
    const loginContainer = document.getElementById('loginContainer');
    const adminDashboard = document.getElementById('adminDashboard');
    const userDashboard = document.getElementById('userDashboard');

    // Check Admin Session
    if (localStorage.getItem('isAdmin') === 'true') {
        loginContainer.style.display = 'none';
        adminDashboard.style.display = 'block';
        loadAdminData();
    }
    // We don't persist User Session for simplicity/security in this static demo, 
    // forcing re-login each time for "Check Status".

    // Admin Login Logic
    const adminForm = document.getElementById('adminLoginForm');
    if (adminForm) {
        adminForm.onsubmit = (e) => {
            e.preventDefault();
            const u = document.getElementById('adminUsername').value;
            const p = document.getElementById('adminPassword').value;

            if (u === 'rohtas123' && p === 'Rohtas@1929') {
                localStorage.setItem('isAdmin', 'true');
                loginContainer.style.display = 'none';
                adminDashboard.style.display = 'block';
                loadAdminData();
            } else {
                alert('Invalid Credentials');
            }
        };
    }

    // User Login Logic
    const userForm = document.getElementById('userLoginForm');
    if (userForm) {
        userForm.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('userLoginName').value.trim();
            const mobile = document.getElementById('userLoginMobile').value.trim();

            const btn = userForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = "Checking...";
            btn.disabled = true;

            try {
                // Reuse the same API to get all bookings, then filter locally
                // Note via User: "user login requirements name and mobile number"
                const response = await fetch(API_URL + '?action=get_bookings');
                const data = await response.json();

                let bookings = [];
                if (data.success && data.bookings) bookings = data.bookings;
                else if (Array.isArray(data)) bookings = data; // Fallback

                // Filter logic
                const myBookings = bookings.filter(b => {
                    // Loose matching
                    const bMobile = (b.mo_number || b.mobile || '').toString().replace(/'/g, '').trim(); // Remove sheet quotes
                    const bName = (b.full_name || b.name || '').toLowerCase();
                    return bMobile === mobile && bName.includes(name.toLowerCase());
                });

                if (myBookings.length > 0) {
                    showUserDashboard(myBookings);
                } else {
                    alert('No bookings found with these details.');
                }

            } catch (err) {
                console.error(err);
                alert('Error fetching records.');
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        };
    }

    // Logout Handlers
    const logoutBtn = document.getElementById('logoutBtn'); // Admin
    if (logoutBtn) {
        logoutBtn.onclick = () => {
            localStorage.removeItem('isAdmin');
            window.location.reload();
        };
    }

    const userLogoutBtn = document.getElementById('userLogoutBtn'); // User
    if (userLogoutBtn) {
        userLogoutBtn.onclick = () => {
            // No local storage for user to clear, just reload
            window.location.reload();
        };
    }
}

function showUserDashboard(bookings) {
    document.getElementById('loginContainer').style.display = 'none';
    const dash = document.getElementById('userDashboard');
    const results = document.getElementById('userBookingResults');
    dash.style.display = 'block';

    results.innerHTML = bookings.map(b => `
        <div style="background: white; padding: 20px; border-radius: 12px; border-left: 5px solid ${b.status === 'Confirmed' ? '#2ecc71' : 'var(--primary-color)'}; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <h3 style="color: var(--secondary-color); margin-bottom: 10px;">Booking ${b.status === 'Confirmed' ? 'Confirmed' : 'Recieved'}</h3>
                <span style="padding: 5px 12px; border-radius: 20px; font-size: 0.85rem; font-weight: 600; 
                    background: ${b.status === 'Confirmed' ? '#e6fffa' : '#fff3cd'}; 
                    color: ${b.status === 'Confirmed' ? '#00bfa5' : '#856404'};">
                    ${b.status || 'Pending'}
                </span>
            </div>
            <p><strong>Date:</strong> ${b.booked_date}</p>
            <p><strong>Name:</strong> ${b.full_name}</p>
            <p><strong>Location:</strong> ${b.location}</p>
            <p><strong>Mobile:</strong> ${b.mo_number}</p>
            <p><strong>Payment:</strong> <span style="font-weight: 600; color: ${b.payment_status === 'Paid' ? 'green' : 'orange'}">${b.payment_status || 'Pending'}</span></p>
        </div>
    `).join('');
}

async function loadAdminData() {
    const tbody = document.getElementById('bookingTableBody');
    tbody.innerHTML = '<tr><td colspan="4">Loading data...</td></tr>';

    try {
        // API action for full details
        const response = await fetch(API_URL + '?action=get_bookings');
        const data = await response.json();

        let bookings = [];
        if (data.success && data.bookings) {
            bookings = data.bookings;
        }

        tbody.innerHTML = '';

        if (bookings.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center">No bookings found.</td></tr>';
            return;
        }

        // Sort by date descending
        bookings.sort((a, b) => new Date(b.booked_date) - new Date(a.booked_date));

        bookings.forEach(b => {
            const tr = document.createElement('tr');
            // Keys: full_name, mo_number, location, booked_date, payment_status, status, admin_notes

            // Payment Button Logic
            // Duplicate removed
            const isPaid = b.payment_status === 'Paid';
            const payBtn = `<button onclick="updateBooking(this, '${b.booked_date}', {payment_status: '${isPaid ? 'Pending' : 'Paid'}'})" 
                class="btn-sm" style="background: ${isPaid ? '#2ecc71' : '#f1c40f'}; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; min-width: 80px;">
                ${isPaid ? 'Paid' : 'Mark Paid'}
            </button>`;

            // Status Button Logic
            const isConfirmed = b.status === 'Confirmed';
            const statusBtn = `<button onclick="updateBooking(this, '${b.booked_date}', {status: '${isConfirmed ? 'Pending' : 'Confirmed'}'})" 
                class="btn-sm" style="background: ${isConfirmed ? '#2ecc71' : '#95a5a6'}; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; min-width: 80px;">
                ${isConfirmed ? 'Confirmed' : 'Confirm'}
            </button>`;


            // Notes Logic - using onchange to auto-save or a specific save action
            // We'll use a small wrapper for the input and a save icon, or just blur update. Blur is easiest but risky if they close tab.
            // Let's use a "Save" text/icon next to it.
            const notesInput = `
                <div style="display: flex; gap: 5px;">
                    <textarea id="note-${b.booked_date}" style="padding: 5px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem; resize: none;" rows="2">${b.admin_notes || ''}</textarea>
                    <button onclick="saveNote('${b.booked_date}')" style="border: none; background: var(--primary-color); color: white; border-radius: 4px; cursor: pointer; padding: 0 8px;">Save</button>
                </div>
            `;

            tr.innerHTML = `
                <td>${b.booked_date || 'N/A'}</td>
                <td>
                    <div>${b.full_name || '-'}</div>
                    <small style="color: #666;">${b.location || '-'}</small>
                </td>
                <td>${b.mo_number || '-'}</td>
                <td>${payBtn}</td>
                <td>${statusBtn}</td>
                <td style="min-width: 200px;">${notesInput}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6">Error loading data: ${e.message}</td></tr>`;
    }
}

async function updateBooking(btn, date, updates) {
    // btn is the button element
    const originalText = btn.innerText;
    const originalColor = btn.style.background;

    // Loading State
    btn.disabled = true;
    btn.innerHTML = '<span class="spin">↻</span>';
    btn.style.opacity = "0.7";

    const payload = {
        action: 'update_booking',
        booked_date: date,
        ...updates
    };

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body: JSON.stringify(payload)
        });
        const res = await response.json();
        if (res.success) {
            showToast('Updated successfully');

            // Optimistic Update (No Full Reload)
            btn.disabled = false;
            btn.style.opacity = "1";

            // Determine new state based on updates
            if (updates.payment_status) {
                const isPaid = updates.payment_status === 'Paid';
                btn.innerText = isPaid ? 'Paid' : 'Mark Paid';
                btn.style.background = isPaid ? '#2ecc71' : '#f1c40f';
                // Toggle next action
                btn.setAttribute('onclick', `updateBooking(this, '${date}', {payment_status: '${isPaid ? 'Pending' : 'Paid'}'})`);
            } else if (updates.status) {
                const isConf = updates.status === 'Confirmed';
                btn.innerText = isConf ? 'Confirmed' : 'Confirm';
                btn.style.background = isConf ? '#2ecc71' : '#95a5a6';
                btn.setAttribute('onclick', `updateBooking(this, '${date}', {status: '${isConf ? 'Pending' : 'Confirmed'}'})`);
            } else if (updates.admin_notes) {
                // Notes usually come from separate save button, handled by safeNote which might not pass 'this' correctly yet
                // But saveNote calls updateBooking with button? No, let's check saveNote
            }

        } else {
            showToast('Update failed: ' + res.message);
            // Revert
            btn.innerHTML = originalText;
            btn.style.background = originalColor;
            btn.disabled = false;
        }
    } catch (e) {
        console.error(e);
        showToast('Error connecting to server');
        btn.innerHTML = originalText;
        btn.style.background = originalColor;
        btn.disabled = false;
    }
}

async function saveNote(date) {
    const noteVal = document.getElementById(`note-${date}`).value;
    const btn = event.target; // Implicit event target from onclick
    await updateBooking(btn, date, { admin_notes: noteVal });
    // Restore text for Save button
    btn.innerText = "Save";
}

// Gallery Filter Logic
function filterGallery(category) {
    // 1. Update Buttons
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => {
        if (btn.innerText.trim().toLowerCase() === category || (category === 'all' && btn.innerText.trim() === 'All')) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 2. Filter Images
    const items = document.querySelectorAll('.gallery-item');
    items.forEach(item => {
        if (category === 'all') {
            item.style.display = 'block';
            setTimeout(() => item.style.opacity = '1', 50);
        } else {
            if (item.classList.contains(`category-${category}`)) {
                item.style.display = 'block';
                setTimeout(() => item.style.opacity = '1', 50);
            } else {
                item.style.opacity = '0';
                setTimeout(() => item.style.display = 'none', 300);
            }
        }
    });
}

/* ===========================
   Quick View Slider Logic
   =========================== */
function initQuickViewSlider() {
    const sliderWrapper = document.getElementById('quickViewSlider');
    if (!sliderWrapper) return;

    const slides = document.querySelectorAll('.slide');
    const prevBtn = document.getElementById('sliderPrev');
    const nextBtn = document.getElementById('sliderNext');
    const dotsContainer = document.getElementById('sliderDots');
    let currentIndex = 0;
    const totalSlides = slides.length;
    let slideInterval;

    // Create Dots
    if (dotsContainer) {
        dotsContainer.innerHTML = ''; // Clear existing
        slides.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.classList.add('dot');
            if (index === 0) dot.classList.add('active');
            dot.addEventListener('click', () => goToSlide(index));
            dotsContainer.appendChild(dot);
        });
    }

    const dots = document.querySelectorAll('.dot');

    function updateSlider() {
        // Use clientWidth of the container for precise pixel-based shifting
        const width = sliderWrapper.parentElement.clientWidth;
        sliderWrapper.style.transform = `translateX(-${currentIndex * width}px)`;

        // Update dots
        dots.forEach(dot => dot.classList.remove('active'));
        if (dots[currentIndex]) dots[currentIndex].classList.add('active');
    }

    function goToSlide(index) {
        currentIndex = index;
        if (currentIndex < 0) currentIndex = totalSlides - 1;
        if (currentIndex >= totalSlides) currentIndex = 0;
        updateSlider();
        resetTimer();
    }

    function nextSlide() {
        goToSlide(currentIndex + 1);
    }

    function prevSlide() {
        goToSlide(currentIndex - 1);
    }

    function resetTimer() {
        clearInterval(slideInterval);
        slideInterval = setInterval(nextSlide, 7000);
    }

    // Recalculate on resize to fix pixel offsets
    window.addEventListener('resize', updateSlider);

    // Event Listeners
    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);

    // Filter swipes for mobile (basic support)
    let touchStartX = 0;
    let touchEndX = 0;

    sliderWrapper.addEventListener('touchstart', e => {
        touchStartX = e.changedTouches[0].screenX;
    });

    sliderWrapper.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });

    function handleSwipe() {
        if (touchStartX - touchEndX > 50) nextSlide();
        if (touchEndX - touchStartX > 50) prevSlide();
    }

    // Auto Slide
    resetTimer();
}

/* ===========================
   Reviews Logic
   =========================== */
let currentReviewSlide = 0;
let totalReviews = 0;

function initReviews() {
    const reviewsContainer = document.getElementById('reviewsContainer');
    if (!reviewsContainer) return;

    fetchReviews();
    setupReviewModal();
}

async function fetchReviews() {
    const container = document.getElementById('reviewsContainer');
    try {
        console.log("Fetching reviews...");
        container.innerHTML = '<div class="text-center" style="width:100%; padding:20px;">Loading reviews...</div>';

        // Cache busting with timestamp
        const response = await fetch(API_URL + '?action=get_reviews&_t=' + new Date().getTime());
        const data = await response.json();
        console.log("Reviews Data:", data);

        if (data.success) {
            if (data.reviews && data.reviews.length > 0) {
                renderReviews(data.reviews);
            } else {
                container.innerHTML = '<div class="text-center" style="width:100%; padding:20px;">No reviews yet. Be the first to share your experience!</div>';
            }
        } else {
            throw new Error(data.message || "Unknown error");
        }
    } catch (error) {
        console.error("Error fetching reviews:", error);
        container.innerHTML = `
            <div class="text-center" style="width:100%; color:red; padding: 20px;">
                <p>Failed to load reviews.</p>
                <button class="btn btn-sm btn-outline-dark" onclick="fetchReviews()">Retry</button>
            </div>`;
    }
}

function renderReviews(reviews) {
    const container = document.getElementById('reviewsContainer');
    container.innerHTML = '';
    totalReviews = reviews.length;
    currentReviewSlide = 0; // Reset

    reviews.forEach(r => {
        // Generate Stars
        let ratingVal = parseInt(r.rating) || 5;
        let stars = '';
        for (let i = 0; i < 5; i++) {
            stars += i < ratingVal ? '★' : '☆';
        }

        // Format Date safely
        let d = "Recent";
        try {
            if (r.date) {
                const dateObj = new Date(r.date);
                if (!isNaN(dateObj.getTime())) {
                    d = dateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                }
            }
        } catch (e) { console.warn("Date parse error", e); }

        const card = document.createElement('div');
        card.className = 'review-card';
        card.innerHTML = `
            <div class="review-rating">${stars}</div>
            <p class="review-text">"${r.review || ''}"</p>
            <div class="reviewer-name">${r.name || 'Guest'}</div>
            <div class="review-date">${d}</div>
        `;
        container.appendChild(card);
    });

    // Force strict reflow
    void container.offsetWidth;
    updateReviewSlider();
}

function updateReviewSlider() {
    const container = document.getElementById('reviewsContainer');
    const cards = document.querySelectorAll('.review-card');
    if (cards.length === 0) return;

    // Calculate width to shift
    const cardWidth = cards[0].offsetWidth; // includes padding/border if border-box
    const gap = 20;
    const moveAmount = (cardWidth + gap) * currentReviewSlide;

    container.style.transform = `translateX(-${moveAmount}px)`;
}

function slideReviews(direction) {
    const isDesktop = window.innerWidth >= 768;
    const visibleCount = isDesktop ? 3 : 1;

    const maxIndex = Math.max(0, totalReviews - visibleCount);

    currentReviewSlide += direction;

    if (currentReviewSlide < 0) currentReviewSlide = 0;
    if (currentReviewSlide > maxIndex) currentReviewSlide = maxIndex; // Stop at end

    updateReviewSlider();
}

// Listen for resize to adjust slider
window.addEventListener('resize', () => {
    slideReviews(0); // Recalc clamp
    updateReviewSlider();
});


/* Review Modal Logic */
function openReviewModal() {
    const modal = document.getElementById('reviewModal');
    // Reset state
    document.getElementById('reviewStep1').style.display = 'block';
    document.getElementById('reviewStep2').style.display = 'none';
    document.getElementById('reviewVerifyForm').reset();
    document.getElementById('reviewSubmitForm').reset();

    modal.style.display = "flex";
    setTimeout(() => modal.classList.add('show'), 10);
}

function closeReviewModal() {
    const modal = document.getElementById('reviewModal');
    modal.classList.remove('show');
    setTimeout(() => modal.style.display = "none", 300);
}

function setupReviewModal() {
    // Step 1: Verify
    const verifyForm = document.getElementById('reviewVerifyForm');
    if (verifyForm) {
        verifyForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = verifyForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = "Verifying...";
            btn.disabled = true;

            const mobileInput = document.getElementById('reviewMobile').value.trim();

            try {
                // Check against bookings (API get all)
                const response = await fetch(API_URL + '?action=get_bookings');
                const data = await response.json();

                let foundUser = null;
                if (data.success && data.bookings) {
                    // Filter for Mobile + Status=Confirmed + Payment=Paid
                    foundUser = data.bookings.find(b => {
                        const bMobile = (b.mo_number || '').toString().replace(/'/g, '').trim();
                        const isConfirmed = (b.status === 'Confirmed' || b.status === 'Booked');
                        const isPaid = (b.payment_status === 'Paid' || b.payment_status === 'Done');
                        return bMobile === mobileInput && isConfirmed && isPaid;
                    });
                }

                if (foundUser) {
                    // Success
                    document.getElementById('reviewStep1').style.display = 'none';
                    document.getElementById('reviewStep2').style.display = 'block';
                    document.getElementById('reviewerNameDisplay').innerText = foundUser.full_name;
                } else {
                    alert("No confirmed and paid booking found for this mobile number.");
                }
            } catch (err) {
                console.error(err);
                alert("Verification failed. Please try again.");
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        };
    }

    // Step 2: Submit
    const submitForm = document.getElementById('reviewSubmitForm');
    if (submitForm) {
        submitForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = submitForm.querySelector('button');
            const originalText = btn.innerText;
            btn.innerText = "Submitting...";
            btn.disabled = true;

            const reviewText = document.getElementById('reviewText').value;
            const mobile = document.getElementById('reviewMobile').value.trim();
            const ratingSelector = document.querySelector('input[name="rating"]:checked');
            const rating = ratingSelector ? ratingSelector.value : 5;

            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'add_review',
                        mobile: mobile,
                        review: reviewText,
                        rating: rating
                    })
                });
                const result = await response.json();

                if (result.success) {
                    showToast("Review Submitted! Thank you.");
                    closeReviewModal();
                    fetchReviews(); // Refresh list
                } else {
                    alert(result.message || "Submission failed.");
                }
            } catch (err) {
                console.error(err);
                alert("Error submitting review.");
            } finally {
                btn.innerText = originalText;
                btn.disabled = false;
            }
        };
    }
}
// Hero Slider Logic
var heroSlides = document.querySelectorAll('.hero-slide');
var currentHeroSlide = 0;
var heroSlideInterval = setInterval(nextHeroSlide, 7000);

function nextHeroSlide() {
    if (heroSlides.length === 0) return;
    heroSlides[currentHeroSlide].classList.remove('active');
    currentHeroSlide = (currentHeroSlide + 1) % heroSlides.length;
    heroSlides[currentHeroSlide].classList.add('active');
}