# 🚀 MH2 IT Center MCQ Exam System

A modern **Online MCQ Examination Platform** developed for **MH2 IT Center** to conduct computer competency exams through a clean, interactive, and responsive web interface.

The project is evolving from a static, browser-based MCQ examination application into a **dynamic, Firebase-powered examination management system** with centralized question management, student verification, exam codes, and result tracking.

> **Project Status:** 🚧 Under Development — Dynamic System Upgrade

---

## 📅 Project Information

| Information | Details |
|---|---|
| **Project Name** | MH2 IT Center MCQ Exam System |
| **Developer** | Murad Hasan Hridoy |
| **Organization** | MH2 IT Center |
| **Project Type** | Online Examination Web Application |
| **Current Version** | Static Prototype |
| **Planned Version** | Firebase-Powered Dynamic System |
| **Primary Language** | JavaScript |
| **Interface Language** | Bengali / English |

---

## ✨ Features

### ✅ Existing Prototype Features

- 🔐 Password-protected exam start
- ⏳ Animated 5-second exam countdown
- 🕒 30-minute examination timer
- 📝 Multiple-choice questions with four options
- 💾 Automatic answer saving using browser LocalStorage
- 🔄 Exam progress restoration after page reload
- 🔒 Automatic exam locking when time expires
- 📊 Automatic result calculation
- ✅ Correct, incorrect, and unanswered question statistics
- 🎨 Dark interface with cyan neon styling
- 🔄 Animated logo flip effect
- 📱 Responsive layout for desktop and mobile devices

### 🚀 Planned Dynamic Features

The following features are planned for the Firebase-powered upgrade and are not yet claimed as implemented.

- 🔑 **Exam Code Authentication** — Students enter their name, Student ID, and assigned Exam Code.
- 🔥 **Firebase Integration** — Store and retrieve examination data from Firebase Realtime Database.
- 🛡️ **Admin Authentication** — Protect the administration dashboard.
- 🖥️ **Admin Dashboard** — Manage examinations, students, settings, and results from one interface.
- ➕ **Question Management** — Create, edit, delete, and organize questions without modifying JavaScript source code.
- ⚙️ **Exam Configuration** — Configure exam duration, marks, question count, and availability.
- 👨‍🎓 **Student Management** — Maintain an approved student list and validate examination eligibility.
- ⏱️ **Centralized Exam Control** — Publish, start, stop, and close examinations.
- 📈 **Result Management** — Review student attempts, scores, and submission status.
- 📤 **Result Export** — Export examination records to CSV.
- 🔐 **Security Rules and Server-Side Validation** — Protect answer keys, validate submissions, and prevent unauthorized database access.
- 🚫 **Duplicate Attempt Prevention** — Enforce attempt limits through trusted backend validation.

---

## 🖥️ Interface Preview

The current prototype includes the following interfaces:

### 🔐 Exam Start Page

Students enter the configured start password before proceeding to the examination.

![Exam Start Preview](code/D.png)

### 📝 Examination Interface

Students answer multiple-choice questions while the countdown timer tracks the remaining time.

![MCQ Exam Preview](code/D2.png)

### 📊 Examination Results

The result screen displays the total number of questions, correct answers, incorrect answers, unanswered questions, and calculated score.

![Exam Result Preview](code/D3.png)

---

## 🛠️ Technology Stack

### Current Prototype

- **HTML5** — Page structure
- **CSS3** — Styling, animations, and responsive layout
- **Vanilla JavaScript** — Question rendering, timer, answer handling, and result calculation
- **LocalStorage** — Browser-side progress persistence

### Planned Dynamic Architecture

- **HTML5, CSS3, and Vanilla JavaScript** — Frontend application
- **Firebase Realtime Database** — Centralized data storage
- **Firebase Authentication** — Administrator authentication
- **Firebase Security Rules** — Database access control
- **Cloud Functions or another trusted backend** — Secure exam validation, submission processing, and result calculation
- **Firebase Hosting** — Deployment and web hosting

---

## 🔄 How the Dynamic System Will Work

1. **Administrator Login:** An authorized administrator accesses the protected dashboard.
2. **Create Examination:** The administrator creates an exam and configures its settings.
3. **Manage Questions:** Questions, options, correct answers, and marks are configured through the dashboard.
4. **Generate Exam Code:** An exam code is issued for the selected examination.
5. **Student Verification:** Students provide their name, Student ID, and Exam Code.
6. **Start Examination:** The system validates eligibility and loads the published questions.
7. **Submit Answers:** Student responses and submission status are recorded securely.
8. **Calculate Results:** The trusted backend validates the submission and calculates the final score.
9. **Review Results:** The administrator reviews examination attempts and student performance.

---

## ⚙️ Run the Current Prototype

### 1. Clone the Repository

Replace the repository URL below with the actual GitHub repository URL if it differs.

```bash
git clone https://github.com/mhhridoy7907/mh2-it-center-mcq-exam.git
```

### 2. Open the Project

Navigate to the project directory:

```bash
cd mh2-it-center-mcq-exam
```

### 3. Launch the Application

Open `code/index.html` in a browser, or use the VS Code Live Server extension if the project is organized inside the `code` directory.

> **Note:** The current prototype runs in the browser and does not require Firebase. The planned dynamic version will require Firebase configuration and appropriate database security rules.

---

## 📂 Project Structure

```text
mh2-it-center-mcq-exam/
│
├── code/
│   ├── index.html
│   ├── style.css
│   ├── funtion.js
│   ├── D.png
│   ├── D2.png
│   └── D3.png
│
└── README.md
```

The structure may evolve as the Admin Panel, Firebase integration, and trusted backend are implemented.

---

## 🔐 Security Considerations

The existing prototype uses browser-side password checks and LocalStorage. These mechanisms are suitable for a basic demonstration but are **not sufficient for a secure online examination system**.

The dynamic version is planned to introduce:

- Protected administrator access
- Firebase Realtime Database Security Rules
- Server-side Exam Code and student eligibility validation
- Secure storage of correct answers
- Trusted score calculation and submission validation
- Duplicate-attempt restrictions
- Server-controlled examination deadlines

Actual security will depend on the final implementation and deployment configuration.

---

## 🎯 Project Goals

The primary goal is to develop a practical online examination platform for training centers and educational institutions.

The project aims to simplify examination management, reduce manual result calculation, centralize question management, and provide a more organized examination experience for students and administrators.

---

## 👨‍💻 Developer

**Murad Hasan Hridoy**  
Founder — **MH2 IT Center**

- GitHub: [@mhhridoy7907](https://github.com/mhhridoy7907)
- Organization: MH2 IT Center

---

## 🤝 Contributions

Suggestions, bug reports, and improvements are welcome.

1. Fork the repository.
2. Create a feature branch.
3. Commit your changes.
4. Submit a pull request describing your improvements.

---

## ⭐ Support the Project

If you find this project useful:

- ⭐ Star the repository
- 🍴 Fork the project
- 🐛 Report bugs or suggest features
- 📢 Share the project with others

---

## 📜 License

This project is intended for educational purposes. A formal open-source license should be added to the repository to define the permissions and conditions for reuse.

---

**Built with ❤️ by MH2 IT Center**

*From a static MCQ prototype toward a dynamic, Firebase-powered examination management platform.*