const API_URL = 'http://localhost:3000/api';

async function fetchJSON(url: string, options?: RequestInit) {
    const res = await fetch(url, options);
    let data;
    try { data = await res.json(); } catch(e) {}
    if (!res.ok) {
        throw { response: { status: res.status, data } };
    }
    return data;
}

async function runSmokeTests() {
    console.log('🚀 Starting Phase 1 Smoke Tests...');

    let token = '';

    // Test 1: Lookup cascades (Public)
    try {
        console.log('\nTesting Lookup Endpoints (Public)...');
        const munData = await fetchJSON(`${API_URL}/lookup/municipalities`);
        if (munData.length === 0) throw new Error('No municipalities found.');
        console.log(`✅ Municipalities loaded: ${munData.length}`);

        const munId = munData[0].id;
        const bgyData = await fetchJSON(`${API_URL}/lookup/barangays/${munId}`);
        console.log(`✅ Barangays for mun ${munId} loaded: ${bgyData.length}`);
        
        if (bgyData.length > 0) {
            const bgyId = bgyData[0].id;
            const schoolData = await fetchJSON(`${API_URL}/lookup/schools/${bgyId}`);
            console.log(`✅ Schools for bgy ${bgyId} loaded: ${schoolData.length}`);
        } else {
            console.log(`✅ No barangays found for mun ${munId}, skipping school lookup.`);
        }
    } catch (err: any) {
        console.error('❌ Lookup Test Failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // Test 2: Unauthenticated access to protected route
    try {
        console.log('\nTesting Unauthenticated Access...');
        await fetchJSON(`${API_URL}/auth/me`);
        console.error('❌ Expected 401 Unauthorized, but got 2xx');
        process.exit(1);
    } catch (err: any) {
        if (err.response?.status === 401) {
            console.log('✅ Unauthenticated access correctly blocked (401).');
        } else {
            console.error('❌ Unauthenticated test failed with wrong status:', err.response?.status);
            process.exit(1);
        }
    }

    // Test 3: Login (Authenticating as admin)
    try {
        console.log('\nTesting Authentication (Login)...');
        const loginData = await fetchJSON(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@pho.gov.ph', password: 'password123' })
        });
        
        token = loginData.token;
        if (!token) throw new Error('No token returned');
        console.log('✅ Login successful. Token received.');
    } catch (err: any) {
        console.error('❌ Login Test Failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // Test 4: Authenticated Access
    try {
        console.log('\nTesting Authenticated Access (/auth/me)...');
        const meData = await fetchJSON(`${API_URL}/auth/me`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (meData.email !== 'admin@pho.gov.ph') throw new Error('Mismatch in authenticated user email');
        console.log('✅ Authenticated /auth/me successful. User:', meData.email);
    } catch (err: any) {
        console.error('❌ /auth/me Test Failed:', err.response?.data || err.message);
        process.exit(1);
    }

    // Test 5: Role Rejection (Admin hitting a teacher-only route)
    try {
        console.log('\nTesting Role-Based Access Control (Admin accessing Teacher route)...');
        await fetchJSON(`${API_URL}/students`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        console.error('❌ Expected 403 Forbidden, but got 2xx');
        process.exit(1);
    } catch (err: any) {
        if (err.response?.status === 403) {
            console.log('✅ RBAC correctly blocked access (403 Forbidden).');
        } else if (err.response?.status === 400) {
             console.error('❌ Expected 403 but got 400. Check middleware order.', err.response?.data);
             process.exit(1);
        } else {
            console.error('❌ RBAC test failed with wrong status:', err.response?.status, err.response?.data);
            process.exit(1);
        }
    }

    console.log('\n🎉 All Phase 1 Smoke Tests Passed Successfully!');
    process.exit(0);
}

runSmokeTests();
