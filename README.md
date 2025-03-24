#  SalesForce Case Notifier

This project utilizes a combination of Bash, Node.js (v22), and Python to query Salesforce queues for new support cases. It features a personal ticket tracking function that can inform you when you have cases to update.

The system is designed to run on Unix-like environments but can be adapted to work on Windows using tools like WSL or Git Bash.

## Project Overview

The application queries Salesforce data at regular intervals and processes support case data. The main script (`startup.sh`) is written in Bash and coordinates the execution of a Node.js script (`trigger.js`) and Python script for notifications.

### Key Features:
- Automated querying of Salesforce data
- Authentication management (including session token and credentials)
- Error handling with notifications via Python script
- Interval-based querying with flexible configuration options
- Logging and debugging capabilities

## Installation

### Prerequisites
To run this application, you'll need the following tools and dependencies installed on your system:

- **Bash Shell** (required for running the startup script)
- **Node.js (v22 or higher)**: [Install Node.js](https://nodejs.org/)
- **Python (3.x)**: [Install Python](https://www.python.org/downloads/)
- **Salesforce Credentials**: You will need a valid Salesforce session.

### Setup

Clone the repository:
```bash
git clone https://github.com/gdd12/SalesForceNotifier.git
```
Navigate to the root directory:
```bash
cd SalesForceNotifier
```
Install node packages:
```bash
npm install
```
Make startup.sh executable:
```bash
chmod +x startup.sh
```
Run the startup.sh script:
```bash
./startup.sh
```
Now, there should be a configuration.xml file in the /config directory. Follow the instructions in that file for the configuration setup and restart by running the (`startup.sh`) script once more.
