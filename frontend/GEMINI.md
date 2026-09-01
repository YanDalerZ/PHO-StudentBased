# Frontend Coding Rules

## React + TypeScript + TailwindCSS v4 Patterns

### Component Structure
```typescript
import React, { useState, useEffect } from 'react';
import type { Student } from '../../types';
import api from '../../services/api';

interface Props {
  studentId: number;
}

const StudentProfile: React.FC<Props> = ({ studentId }) => {
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // fetch data
  }, [studentId]);

  if (loading) return <LoadingSpinner />;
  if (!student) return <div>Student not found</div>;

  return (/* JSX */);
};

export default StudentProfile;
```

### TailwindCSS v4 Rules
- TailwindCSS v4 is configured via `@tailwindcss/vite` plugin — NO `tailwind.config.js` file.
- Import Tailwind in `index.css` with `@import "tailwindcss"`.
- Custom theme values use CSS custom properties or `@theme` directive in CSS.
- If you need `@apply`, do it inside `.css` files, not in `className` strings.

### Existing Design System
The app uses a dark theme already established in Login.tsx and UserDashboard.tsx:
- **Background**: `bg-slate-950`, `bg-slate-900`
- **Cards**: `bg-slate-900/50 border border-slate-800/60 rounded-2xl`
- **Text**: `text-white` (headings), `text-slate-400` (secondary)
- **Primary accent**: `teal-400`/`teal-500` for interactive elements
- **Secondary accent**: `blue-500`/`blue-600` for secondary CTAs
- **Gradients**: `bg-linear-to-r from-teal-500 to-blue-600` for buttons
- **Status colors**: emerald (success), amber (warning/pending), rose (error/danger)
- **Border radius**: `rounded-xl` (inputs), `rounded-2xl` (cards)

### API Service Pattern
All API calls MUST go through the centralized `services/api.ts`:
```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// JWT interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
```

Do NOT create one-off `fetch()` or `axios()` calls in components. Always use `api.get()`, `api.post()`, etc.

### Routing Pattern
- Use `react-router-dom` v7 with `<BrowserRouter>`.
- Protected routes wrap content with `<ProtectedRoute allowedRoles={['teacher']}>`.
- Role-based redirect after login:
  - `teacher` → `/teacher`
  - `superuser` → `/dashboard`
  - `admin` → `/admin`

### Form Patterns
- Use controlled components with `useState`.
- For complex forms (module forms), group related fields in fieldsets.
- Show validation errors inline below inputs.
- Use `react-hot-toast` for success/error notifications after API calls.
- Pre-fill student info (name, DOB, school) on module forms.

### Data Fetching
- Use `useEffect` for data fetching with cleanup.
- Always handle loading, error, and empty states.
- Display `<LoadingSpinner />` during fetches.
- Show user-friendly error messages, not raw API errors.

### Icon Usage
- Use `lucide-react` for all icons. It's already installed.
- Import icons individually: `import { Heart, Users } from 'lucide-react'`.
- Default icon size: `className="w-5 h-5"` (adjust per context).

### DO NOT
- Do NOT install or use any icon library other than `lucide-react`.
- Do NOT install Material UI, Chakra UI, Ant Design, or any UI framework.
- Do NOT use inline styles — use TailwindCSS classes.
- Do NOT create `tailwind.config.js` — TailwindCSS v4 doesn't use it.
- Do NOT import CSS modules — use `.css` files with plain CSS or Tailwind.
