import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import TripList from './components/trips/TripList.jsx';
import TripDetail from './components/trips/TripDetail.jsx';
import TripWishes from './components/trips/TripWishes.jsx';
import TaskList from './components/tasks/TaskList.jsx';
import ShoppingList from './components/shopping/ShoppingList.jsx';
import DealsFeed from './components/deals/DealsFeed.jsx';
import Login from './components/auth/Login.jsx';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trips" element={<TripList />} />
          <Route path="/trips/:id" element={<TripDetail />} />
          <Route path="/trips/wishes" element={<TripWishes />} />
          <Route path="/tasks" element={<TaskList />} />
          <Route path="/shopping" element={<ShoppingList />} />
          <Route path="/deals" element={<DealsFeed />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
