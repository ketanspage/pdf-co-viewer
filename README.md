# PDF Co-Viewer

PDF Co-Viewer is a collaborative web application that allows users to view PDF files in a shared environment. The application supports roles for an "Admin" who can upload PDFs and control the page view, and multiple "Users" who can join sessions using an access code to view the shared PDF in real time.

## Features

- **File Upload**: Admins can upload PDF files (up to 10 MB).
- **Real-Time PDF Viewing**: Users can join a session with an access code to view the PDF together.
- **Page Control**: Admins can control the current page of the PDF, and all users will see the same page.
- **Session Management**: Sessions automatically expire after a set period of inactivity.
- **File Cleanup**: Uploaded files older than 24 hours are deleted to save storage space.

## Tech Stack

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML, Tailwind CSS, JavaScript, PDF.js
- **File Uploads**: Multer
- **Deployment**: Render 

## Setup and Installation

1. **Clone the Repository**:
   ```bash
   git clone <repository-url>
   cd pdf-co-viewer

2. **Install Dependencies**:
   ```bash
   npm install

3. **Run the Application**:
   ```bash
   npm start

## Usage
1. **Login as Admin or User:**

- **Admin:** Choose "Admin" from the dropdown on the login page. Upon login, you can upload PDF files and control the page view.
- **User:** Choose "User" and enter the access code provided by the Admin to join the session.
2. **PDF Viewing and Controls:**

- Admins can use the "Previous" and "Next" buttons to navigate through the PDF, and all users will see the updated page in real time.

