// Google Apps Script Code for Hotel Booking
// Deploy as Web App: "Me", "Anyone"
// Columns for 'Bookings':
// 0: Name (A), 1: Mobile (B), 2: Location (C), 3: Date (D), 4: Timestamp (E)
// 5: Status (F), 6: Payment (G), 7: Notepad (H)
// Columns for 'Reviews': 0: Name, 1: Review, 2: Date

const BOOKINGS_SHEET = "Bookings";
const REVIEWS_SHEET = "Reviews";
const TIMEZONE = "GMT+5:30"; // Indian Standard Time

function doGet(e) {
    const params = e.parameter;
    const action = params.action;

    if (action === 'get_bookings') {
        return getBookings();
    } else if (action === 'get_reviews') {
        return getReviews();
    }

    return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Invalid action" }))
        .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    try {
        const data = JSON.parse(e.postData.contents);
        const action = data.action;

        if (action === 'book') {
            return createBooking(data);
        } else if (action === 'update_booking') {
            return updateBooking(data);
        } else if (action === 'add_review') {
            return addReview(data);
        }

        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Invalid action" }))
            .setMimeType(ContentService.MimeType.JSON);

    } catch (error) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
            .setMimeType(ContentService.MimeType.JSON);
    }
}

function getSheet(name) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
        sheet = ss.insertSheet(name);
        if (name === BOOKINGS_SHEET) {
            sheet.appendRow(["Full Name", "Mobile", "Location", "Booked Date", "Timestamp", "Status", "Payment", "Notepad"]);
        } else if (name === REVIEWS_SHEET) {
            sheet.appendRow(["Name", "Review", "Date", "Rating"]);
        }
    }
    return sheet;
}

function getBookings() {
    const sheet = getSheet(BOOKINGS_SHEET);
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1); // Skip header

    const bookings = rows.map(row => {
        // Format Date explicitly to IST string YYYY-MM-DD
        let dateStr = row[3];
        if (Object.prototype.toString.call(dateStr) === '[object Date]') {
            dateStr = Utilities.formatDate(dateStr, TIMEZONE, "yyyy-MM-dd");
        }

        return {
            full_name: row[0],
            mo_number: row[1],
            location: row[2],
            booked_date: dateStr, // Key
            timestamp: row[4],
            status: row[5] || 'Pending',
            payment_status: row[6] || 'Pending',
            admin_notes: row[7] || ''
        };
    });

    return ContentService.createTextOutput(JSON.stringify({ success: true, bookings: bookings }))
        .setMimeType(ContentService.MimeType.JSON);
}

function getReviews() {
    const sheet = getSheet(REVIEWS_SHEET);
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);

    // Sort by Date Descending (Newest First) if possible, or just reverse
    const reviews = rows.map(row => ({
        name: row[0],
        review: row[1],
        date: row[2],
        rating: row[3] || 5
    })).filter(r => r.review && r.review.trim() !== ""); // Only non-empty reviews

    return ContentService.createTextOutput(JSON.stringify({ success: true, reviews: reviews.reverse() }))
        .setMimeType(ContentService.MimeType.JSON);
}

function createBooking(data) {
    const sheet = getSheet(BOOKINGS_SHEET);
    const bookings = sheet.getDataRange().getValues();

    // Check duplicates in Col 3
    for (let i = 1; i < bookings.length; i++) {
        let existingDate = bookings[i][3];
        if (Object.prototype.toString.call(existingDate) === '[object Date]') {
            existingDate = Utilities.formatDate(existingDate, TIMEZONE, "yyyy-MM-dd");
        }
        if (existingDate == data.booked_date) {
            return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Date already booked" }))
                .setMimeType(ContentService.MimeType.JSON);
        }
    }

    // Append Row
    sheet.appendRow([
        data.full_name,
        data.mo_number,
        data.location,
        data.booked_date,
        new Date(),
        'Pending',
        'Pending',
        ''
    ]);

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Booking Created" }))
        .setMimeType(ContentService.MimeType.JSON);
}

function updateBooking(data) {
    const sheet = getSheet(BOOKINGS_SHEET);
    const rows = sheet.getDataRange().getValues();
    let rowIndex = -1;

    for (let i = 1; i < rows.length; i++) {
        let rowDate = rows[i][3];
        if (Object.prototype.toString.call(rowDate) === '[object Date]') {
            rowDate = Utilities.formatDate(rowDate, TIMEZONE, "yyyy-MM-dd");
        }
        if (rowDate == data.booked_date) {
            rowIndex = i + 1;
            break;
        }
    }

    if (rowIndex === -1) {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: "Booking not found" }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // Update Status(6), Payment(7), Notes(8)
    if (data.status !== undefined) sheet.getRange(rowIndex, 6).setValue(data.status);
    if (data.payment_status !== undefined) sheet.getRange(rowIndex, 7).setValue(data.payment_status);
    if (data.admin_notes !== undefined) sheet.getRange(rowIndex, 8).setValue(data.admin_notes);

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Updated" }))
        .setMimeType(ContentService.MimeType.JSON);
}

function addReview(data) {
    // 1. Validate User
    const bookingsSheet = getSheet(BOOKINGS_SHEET);
    const bookings = bookingsSheet.getDataRange().getValues();
    let isValidUser = false;
    let reviewerName = "";

    // Mobile number is unique-ish identifier we ask for
    // data must contain: mobile, review, rating
    const targetMobile = String(data.mobile).trim();

    for (let i = 1; i < bookings.length; i++) {
        const rowMobile = String(bookings[i][1]).trim();
        const status = bookings[i][5]; // Status
        const payment = bookings[i][6]; // Payment

        if (rowMobile === targetMobile) {
            // Found user, check status
            if ((status === 'Confirmed' || status === 'Booked') && (payment === 'Done' || payment === 'Paid')) {
                isValidUser = true;
                reviewerName = bookings[i][0]; // Full Name
                break;
            }
        }
    }

    if (!isValidUser) {
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            message: "You can only leave a review if you have a Confirmed Booking and Payment is Done."
        })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Add Review
    const sheet = getSheet(REVIEWS_SHEET);
    sheet.appendRow([reviewerName, data.review, new Date(), data.rating || 5]);

    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Review Added Successfully!" }))
        .setMimeType(ContentService.MimeType.JSON);
}
