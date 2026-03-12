import { Navigate } from 'react-router-dom';
import { getPanelToken } from '../lib/storage';

export default function ProtectedRoute({ children }) {
    const token = getPanelToken();
    if (!token) return <Navigate to="/login" replace />;
    return children;
}
