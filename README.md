# Taita Taveta University Health Unit Management System

A role-based health-unit portal for managing appointments, medical records, operational settings, and patient support at Taita Taveta University. The application runs locally with AWS service mocks and can be deployed to AWS using AWS CDK and AWS Building Blocks.

Repository: [github.com/JAPHES/hospital_management_system](https://github.com/JAPHES/hospital_management_system)

## Features

- Amazon Cognito authentication with sign-up, confirmation, sign-in, and password-reset flows
- Patient dashboard for booking, viewing, and cancelling appointments
- Doctor dashboard for accepting and completing appointments and adding medical records
- Administrator dashboard for visiting hours, ER wait time, bed capacity, and announcements
- AI reception assistant backed by Amazon Bedrock and a health knowledge base
- Real-time appointment and settings updates
- Responsive TTU-branded interface with the official university logo
- Default visiting hours of **24 hours, 7 days a week**

## Technology Stack

- TypeScript and Lit HTML
- Vite
- AWS Building Blocks
- Amazon Cognito
- Amazon DynamoDB
- Amazon Bedrock and Knowledge Bases
- AWS CDK
- Node.js test runner

## Prerequisites

- Node.js 22 or newer
- npm
- AWS credentials only when using the sandbox or deployment commands

## Local Setup

```bash
git clone https://github.com/JAPHES/hospital_management_system.git
cd hospital_management_system
npm install
npm run dev
```

On Windows PowerShell, use `npm.cmd run dev` if script execution policy prevents `npm.ps1` from running.

Open [http://localhost:3000](http://localhost:3000) after the development server starts.

### Local Verification Codes

Local development uses a Cognito mock and does not send real email. After sign-up or a password-reset request, the verification code appears in the development terminal:

```text
[AUTH] signUp code for username: 123456
```

The latest code is also stored in `.bb-data/hosp-auth/last-code.json`. The `.bb-data` directory contains local mock data and is excluded from Git.

When deployed to AWS, Amazon Cognito sends verification codes through its configured email or SMS delivery channel.

## Available Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local backend mocks and frontend development server |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run build` | Build the production frontend |
| `npm run test:e2e` | Run end-to-end API tests |
| `npm run sandbox` | Deploy an AWS sandbox backend and serve the frontend locally |
| `npm run sandbox:destroy` | Remove the current AWS sandbox stack |
| `npm run deploy` | Build and deploy the production AWS stack |
| `npm run destroy` | Remove the production stack |

## Project Structure

| Path | Purpose |
| --- | --- |
| `aws-blocks/index.ts` | Authentication, data models, API methods, real-time channels, and AI agent |
| `aws-blocks/index.cdk.ts` | AWS CDK stack and hosting configuration |
| `aws-blocks/scripts/` | Development, deployment, cleanup, and knowledge-document scripts |
| `src/index.ts` | Role-based frontend and AI chat interface |
| `index.html` | Application shell, styling, header, and TTU branding |
| `public/ttu-logo.jpg` | TTU logo used by the header and browser favicon |
| `knowledge/` | PDF documents indexed by the health knowledge base |
| `test/e2e.test.ts` | Authentication and health-unit workflow tests |

## User Roles

### Patient

- View available doctors
- Book and cancel appointments
- View appointment status and medical records
- Use the AI reception assistant

### Doctor

- View assigned appointments
- Accept, complete, or cancel appointments
- Add patient diagnoses, treatments, and prescriptions
- Review patient records

### Administrator

- Update visiting hours
- Update ER wait time and bed-capacity information
- Publish health-unit announcements

The role switcher in the current interface is intended for development and demonstration. Production authorization rules should assign roles through a controlled administrator workflow.

## AWS Deployment

Deploy a temporary development sandbox:

```bash
npm run sandbox
```

Deploy the production application:

```bash
npm run deploy
```

CloudFormation stack names are derived from the `stackId` in `.blocks/config.json`. Production uses `<stackId>-prod`; sandbox deployments use a machine-specific suffix so multiple developers can work independently.

## Testing

```bash
npm run typecheck
npm run test:e2e
npm run build
```

The end-to-end tests cover authentication, role changes, appointments, medical records, settings, and real-time behavior.
