import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './index.css';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import AppLoader from './components/AppLoader';

const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Scripts = lazy(() => import('./pages/Scripts'));
const BrainrotsInfo = lazy(() => import('./pages/BrainrotsInfo'));

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <ErrorBoundary>
            <BrowserRouter>
                <Suspense fallback={<AppLoader />}>
                    <Routes>
                        <Route path="/login" element={<Login />} />
                        <Route
                            path="/"
                            element={(
                                <ProtectedRoute>
                                    <Layout />
                                </ProtectedRoute>
                            )}
                        >
                            <Route index element={<Dashboard />} />
                            <Route path="scripts" element={<Scripts />} />
                            <Route path="brainrotsinfo" element={<BrainrotsInfo />} />
                        </Route>
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </ErrorBoundary>
    </StrictMode>,
);
