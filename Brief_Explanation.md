# PulseBoard — Flask Appointment Board

A full-stack appointment management app built with **Flask, SQLite, HTML, CSS, and Vanilla JavaScript**.

## ✨ Features

* Create, view, update, and delete appointments
* Mark appointments as scheduled, completed, or cancelled
* Filter by date and status
* Prevent overlapping appointments on the server
* Cancelled appointments do not block time slots
* Responsive UI with modal forms
* CRUD actions work without page refresh
* Includes sample appointments

## 📁 Project Structure

```text
appointment-board-flask/
├── app.py
├── requirements.txt
├── README.md
├── run_windows.bat
├── .gitignore
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── app.js
```

SQLite creates `appointments.db` automatically when the app runs.

## 🏗️ Architecture

```text
Browser
HTML + CSS + JavaScript
        │
     HTTP/JSON
        ▼
Flask REST API
        │
    SQL Queries
        ▼
SQLite Database
```

The frontend uses JavaScript `fetch()` to communicate with the Flask API.

## 🔌 API Endpoints

| Method   | Endpoint                        | Purpose            |
| -------- | ------------------------------- | ------------------ |
| `GET`    | `/api/appointments`             | List appointments  |
| `POST`   | `/api/appointments`             | Create appointment |
| `PUT`    | `/api/appointments/<id>`        | Update appointment |
| `PATCH`  | `/api/appointments/<id>/status` | Change status      |
| `DELETE` | `/api/appointments/<id>`        | Delete appointment |

Filters:

```text
GET /api/appointments?date=2026-09-09
GET /api/appointments?status=scheduled
```

## ⚠️ Conflict Validation

The server rejects overlapping appointments using:

```text
existing.start < new.end
AND
existing.end > new.start
```

Back-to-back appointments are allowed:

```text
10:00–11:00
11:00–12:00
```

Cancelled appointments are ignored during conflict checks.

## 🗄️ Database

The `appointments` table includes:

```text
id
title
description
appointment_date
start_time
end_time
status
created_at
```

Valid statuses:

```text
scheduled
completed
cancelled
```

## 🧪 Conflict Test

Create:

```text
Interview
11:30–12:30
```

Then create:

```text
Another Interview
11:45–12:15
```

The second appointment should be rejected with:

```text
409 Conflict
```

This confirms that time conflicts are validated server-side.
