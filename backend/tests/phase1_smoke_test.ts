import type { TestContext } from './helpers/testContext.js';

interface Municipality {
    id: number;
    name: string;
}

interface Barangay {
    id: number;
    municipality_id: number;
    name: string;
}

interface School {
    id: number;
    barangay_id: number;
    name: string;
}

interface LoginResponse {
    token: string;
    user?: unknown;
}

interface AuthMeResponse {
    id: number;
    email: string;
    role: string;
}

interface HttpErrorPayload {
    response?: {
        status: number;
        data?: unknown;
    };
    message?: string;
}

export async function runPhase1SmokeTests(context: TestContext): Promise<void> {
    const { apiBaseUrl } = context;

    async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
        const res = await fetch(url, options);
        let data: unknown;
        try { data = await res.json(); } catch(e) {}
        if (!res.ok) {
            const err: HttpErrorPayload = { response: { status: res.status, data } };
            throw err;
        }
        return data as T;
    }

    console.log('🚀 Starting Phase 1 Smoke Tests...');

    let token = '';

    // Test 1: Lookup cascades (Public)
    try {
        console.log('\nTesting Lookup Endpoints (Public)...');
        const munData = await fetchJSON<Municipality[]>(`${apiBaseUrl}/lookup/municipalities`);
        if (munData.length !== 17) throw new Error(`Expected 17 municipalities, got ${munData.length}.`);
        console.log(`✅ Municipalities loaded: ${munData.length}`);

        const munId = munData.find(municipality => municipality.name === 'Kalibo')?.id;
        if (!munId) throw new Error('Municipality ID is missing');
        const bgyData = await fetchJSON<Barangay[]>(`${apiBaseUrl}/lookup/barangays/${munId}`);
        console.log(`✅ Barangays for mun ${munId} loaded: ${bgyData.length}`);
        
        if (bgyData.length === 0) throw new Error('Kalibo must have seeded barangays.');
        if (bgyData.some(barangay => barangay.municipality_id !== munId)) {
            throw new Error('Barangay cascade returned a different municipality.');
        }
        {
            const bgyId = bgyData.find(barangay => barangay.name === 'Poblacion')?.id;
            if (!bgyId) throw new Error('Barangay ID is missing');
            const schoolData = await fetchJSON<School[]>(`${apiBaseUrl}/lookup/schools/${bgyId}`);
            if (schoolData.length === 0) throw new Error('Poblacion, Kalibo must have a seeded school.');
            if (!schoolData.some(school => school.name === 'Kalibo Elementary School')) {
                throw new Error('Expected sample school in Poblacion, Kalibo.');
            }
            if (schoolData.some(school => school.barangay_id !== bgyId)) {
                throw new Error('School cascade returned a different barangay.');
            }
            console.log(`✅ Schools for bgy ${bgyId} loaded: ${schoolData.length}`);
        }
    } catch (err: unknown) {
        const httpErr = err as HttpErrorPayload;
        console.error('❌ Lookup Test Failed:', httpErr.response?.data || httpErr.message || err);
        throw err;
    }

    // Test 2: Unauthenticated access to protected route
    try {
        console.log('\nTesting Unauthenticated Access...');
        await fetchJSON(`${apiBaseUrl}/auth/me`);
        throw new Error('Expected 401 Unauthorized, but got 2xx');
    } catch (err: unknown) {
        const httpErr = err as HttpErrorPayload;
        if (httpErr.response?.status === 401) {
            console.log('✅ Unauthenticated access correctly blocked (401).');
        } else {
            console.error('❌ Unauthenticated test failed with wrong status:', httpErr.response?.status);
            throw err;
        }
    }

    // Test 3: Login (Authenticating as admin)
    // Note: To remain non-destructive, we rely on the seeded admin for READ ONLY smoke tests (like /auth/me).
    // The previous tests verify isolated users. 
    try {
        console.log('\nTesting Authentication (Login)...');
        const loginData = await fetchJSON<LoginResponse>(`${apiBaseUrl}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@pho.gov.ph', password: 'password123' })
        });
        
        token = loginData.token;
        if (!token) throw new Error('No token returned');
        console.log('✅ Login successful. Token received.');
    } catch (err: unknown) {
        const httpErr = err as HttpErrorPayload;
        console.error('❌ Login Test Failed:', httpErr.response?.data || httpErr.message || err);
        throw err;
    }

    // Test 4: Authenticated Access
    try {
        console.log('\nTesting Authenticated Access (/auth/me)...');
        const meData = await fetchJSON<AuthMeResponse>(`${apiBaseUrl}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (meData.email !== 'admin@pho.gov.ph') throw new Error('Mismatch in authenticated user email');
        console.log('✅ Authenticated /auth/me successful. User:', meData.email);
    } catch (err: unknown) {
        const httpErr = err as HttpErrorPayload;
        console.error('❌ /auth/me Test Failed:', httpErr.response?.data || httpErr.message || err);
        throw err;
    }

    // Test 5: Role Rejection (Admin hitting a teacher-only route)
    try {
        console.log('\nTesting Role-Based Access Control (Admin accessing Teacher route)...');
        await fetchJSON(`${apiBaseUrl}/students`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        throw new Error('Expected 403 Forbidden, but got 2xx');
    } catch (err: unknown) {
        const httpErr = err as HttpErrorPayload;
        if (httpErr.response?.status === 403) {
            console.log('✅ RBAC correctly blocked access (403 Forbidden).');
        } else if (httpErr.response?.status === 400) {
             console.error('❌ Expected 403 but got 400. Check middleware order.', httpErr.response?.data);
             throw err;
        } else {
            console.error('❌ RBAC test failed with wrong status:', httpErr.response?.status, httpErr.response?.data);
            throw err;
        }
    }

    console.log('\n🎉 All Phase 1 Smoke Tests Passed Successfully!');
}
