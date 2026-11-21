# ⚙️ SalonBook API — Backend Server

RESTful backend API for **SalonBook**, a role-based salon service and appointment booking platform. Built with Node.js, Express.js, and MongoDB, featuring JWT authentication/authorization, server-enforced booking rules, and signature-verified Stripe payment webhooks.

---

## 🌐 Live Links & Repositories

- **Live API Server:** https://salonbook-server-sigma.vercel.app
- **Live Client App:** https://salonbook-client-gules.vercel.app/
- **Server Repository:** https://github.com/Arif2ankhi/salonbook-server
- **Client Repository:** https://github.com/Arif2ankhi/salonbook-client



## 🧰 Technology Stack

- **Runtime & Framework:** Node.js, Express.js
- **Database:** MongoDB Atlas (Native MongoDB Driver — `salonbook` database)
- **Authentication & Security:** JWT Authentication, Role-Based Authorization (`customer` / `admin`), CORS
- **Payments:** Stripe Checkout API & Webhook Verification

---

## 🗄️ MongoDB Collections (`salonbook`)

- **`user`**: Registered customer and admin accounts (`name`, `email`, `image`, `phone`, `role`, `isBlocked`, `createdAt`)
- **`services`**: Salon treatments (`name`, `category`, `price`, `duration`, `image`, `location`, `specialist`, `description`, `status`)
- **`appointments`**: Customer booking requests (`serviceId`, `customerEmail`, `appointmentDate`, `timeSlot`, `status`, `paymentStatus`, `message`, `createdAt`)
- **`transactions`**: Verified Stripe payment records

---

## 🔌 API Endpoints

| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/` | Public | Health check endpoint |
| `GET` | `/services` | Public | Fetch all services (supports `?status=Active`) |
| `GET` | `/services/:id` | Public | Fetch single service by MongoDB `ObjectId` |
| `POST` | `/services` | Admin | Create a new salon service |
| `PATCH` | `/services/:id` | Admin | Update service details or toggle `Active` / `Inactive` |
| `DELETE` | `/services/:id` | Admin | Delete a service |
| `POST` | `/appointments` | Customer | Create booking request (blocks admin bookings, inactive services, and duplicate slots) |
| `GET` | `/appointments` | Auth | Fetch appointments (`?email=` for customer, all records for admin) |
| `PATCH` | `/appointments/:id` | Auth | Update status (`Pending` → `Confirmed` or `Cancelled` with server-side validation) |
| `GET` | `/users` | Admin | Fetch all registered users |
| `GET` | `/users/profile` | Auth | Fetch user profile by `?email=` |
| `PATCH` | `/users/profile` | Auth | Update permitted fields (`name`, `image`, `phone`) only |
| `POST` | `/create-checkout-session` | Customer | Create Stripe Checkout session for a confirmed appointment |
| `POST` | `/webhook/stripe` | Stripe | Signature-verified webhook to mark appointment `Paid` and record transaction |

---

## 🚀 Local Setup & Installation

### 1. Clone the Repository
```bash
git clone https://github.com/Arif2ankhi/salonbook-server.git
cd salonbook-server
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables Setup
Create a `.env` file in the root directory of the project and configure the following environment variables:

```env
PORT=5000
DB_USER=your_mongodb_username
DB_PASSWORD=your_mongodb_password
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

### 4. Run the Development Server
```bash
npm start
```
The server will start on `http://localhost:5000`.

---

## 🛠️ Available Scripts

- `npm start` — Starts the Node.js Express server using native ESM modules.

---

## 👤 Author

- **Arif** — [GitHub Profile](https://github.com/Arif2ankhi)

---

## 📄 License

This project is licensed under the ISC License.
