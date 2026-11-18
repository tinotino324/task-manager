import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import DataTable from './DataTable';

const API         = 'http://localhost:5000/api/users';


function Users() {
  const [users, setUsers]         = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const navigate                  = useNavigate();

  function refresh() 
  {
    setReloadKey((k) => k + 1);
    loadStats();
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() 
  {
    const res = await apiFetch(API);
    if (res.ok) setUsers(await res.json());
  }

   const columns = [
    {
      label: 'Name',
      key: 'name',
      render: (user) => (
        <span>{user.name}</span>
      ),
    },
    {
      label: 'Email',
      key: 'email',
      render: (user) => (
        <span>{user.email}</span>
      ),
    },
    {
      label: 'Role',
      key: 'role',
      render: (user) => (
        <span className={`badge ${user.role === 1 ? 'high' : 'low'}`}>
          {user.role === 1 ? 'Admin' : 'User'}
        </span>
      ),
    }
  ];

  return (
    <div className="page">
      <div className="page-header header-row">
        <div>
          <h1>Users</h1>
          <p>Everyone registered in the system</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/')}>
          Back to tasks
        </button>
      </div>

      <div className="card dataTables_wrapper">
        <div className="card">
        <h2>All Users</h2>
        <DataTable url={API} dataKey="tasks" columns={columns} reloadKey={reloadKey} />
        </div>
      </div>
    </div>
  );
}

export default Users;