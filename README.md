# Ottobon Platform Backend

This is the NestJS backend for the Ottobon Platform.

## Architecture

The backend is built using:
- **NestJS** for the application framework.
- **Prisma** for ORM and database schema management.
- **PostgreSQL** for the relational database.

### Domain Model

We adhere strictly to a **"One product, one domain model"** High-Level Design. 
- A `Person` is strictly an identity and does not have innate roles (like "Admin") attached to their global profile.
- All access and permissions are managed through `Workspace` and `WorkspaceMembership`.

#### Role-Based Access Control (RBAC)
Platform administrators are simply users who hold an active `WorkspaceMembership` to the central workspace where `workspaceType === 'OTTOBON'`. 

### Authentication Flow
1. **Registration:** Users provide an email which is verified via an OTP. Upon successful verification, they register and are immediately assigned to a new `Workspace` and `Organization` (if they are an Enterprise/Academy account).
2. **Login:** The `AuthService` validates the password using `bcrypt`.
3. **JWT Generation:** During login, the system fetches all active `WorkspaceMemberships` for the user and embeds them directly into the JWT payload.
4. **Scalability:** By embedding the workspace roles in the JWT, the frontend can perform instantaneous, 0-database-query routing for its users across all authorization levels.

## Running Locally

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate dev

# Seed the database with the Super Admin (admin@ottobon.com)
npx ts-node prisma/seed.ts

# Start the application
npm run start:dev
```
