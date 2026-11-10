import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getAccountRequest, supportError, type AccountRequest } from '../../services/supportApi';
import UserManagement from './UserManagement';

export default function ProvisionRequestedUser() {
  const { id = '' } = useParams();
  const [result, setResult] = useState<{ id: string; request?: AccountRequest; error?: string }>();
  useEffect(() => {
    let current = true;
    void getAccountRequest(id).then(request => {
      if (current) setResult({ id, request });
    }).catch(failure => { if (current) setResult({ id, error: supportError(failure) }); });
    return () => { current = false; };
  }, [id]);
  if (result?.id === id && result.request?.status === 'pending') {
    return <UserManagement key={id} accountRequest={result.request} />;
  }
  return <div className="p-6 space-y-4">
    <p role="status">{result?.id !== id ? 'Loading account request…' : result.error ?? 'This request is no longer pending.'}</p>
    <Link to="/admin/support" className="font-semibold text-teal-700 dark:text-teal-300">Back to Contact &amp; Support</Link>
  </div>;
}
