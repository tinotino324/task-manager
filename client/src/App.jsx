import { useEffect, useState } from 'react';
import DataTable from './DataTable';
import { apiFetch } from './api';
import { useNavigate } from 'react-router-dom';

const API         = 'http://localhost:5000/api/tasks';
const USERS_API   = 'http://localhost:5000/api/users/getUsersRow';
const ROLE_ADMIN  = 1;

function formatDate(value) 
{
  if (!value) return '-';
  const date = new Date(value.slice(0, 10) + 'T00:00:00');
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function App({ user, onLogout }) 
{
  const isAdmin                       = user.role === ROLE_ADMIN;
  const [stats, setStats]             = useState({ total: 0, todo: 0, in_progress: 0, done: 0 });
  const [reloadKey, setReloadKey]     = useState(0);
  const [users, setUsers]             = useState([]);
  const [title, setTitle]             = useState('');
  const [priority, setPriority]       = useState('medium');
  const [deadline, setDeadline]       = useState('');
  const [assignedTo, setAssignedTo]   = useState('');
  const [created_by , setAssignedBy]  = useState('');
  const navigate                      = useNavigate();

  async function loadStats() 
  {
    const res = await apiFetch(`${API}/stats`);
    setStats(await res.json());
  }

  // Only an admin needs the user list (for the "assign to" dropdowns)
  async function loadUsers() 
  {
    const res = await apiFetch(USERS_API);
    if (res.ok) setUsers(await res.json());
  }

  function refresh() 
  {
    setReloadKey((k) => k + 1);
    loadStats();
  }

  useEffect(() => {
    loadStats();
    if (isAdmin) loadUsers();
  }, []);

  async function addTask(e) {
    e.preventDefault();
    await apiFetch(API, {
      method: 'POST',
      body: JSON.stringify({ title, priority, deadline, assigned_to: assignedTo }),
    });
    setTitle('');
    setDeadline('');
    setAssignedTo('');
    refresh();
  }

  // Sends the whole task with one field changed
  async function updateTask(task, changes) {
    await apiFetch(`${API}/${task.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...task, ...changes }),
    });
    refresh();
  }

  async function deleteTask(id) {
    if (!window.confirm('Delete this task?')) return;
    await apiFetch(`${API}/${id}`, { method: 'DELETE' });
    refresh();
  }

  const today = new Date().toLocaleDateString('en-CA'); // gives YYYY-MM-DD

  const columns = [
    {
      label: 'Title',
      key: 'title',
      render: (task) => (
        <span className={task.status === 'done' ? 'done-title' : ''}>{task.title}</span>
      ),
    },
    {
      label: 'Assigned to',
      key: 'assigned_name',
      render: (task) =>
        isAdmin ? (
          <select
            value={task.assigned_to || ''}
            onChange={(e) => updateTask(task, { assigned_to: e.target.value || null })}
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : (
          task.assigned_name || 'Unassigned'
        ),
    },
    {
      label: 'Priority',
      key: 'priority',
      render: (task) => <span className={`badge ${task.priority}`}>{task.priority}</span>,
    },
    {
      label: 'Assigned by',
      key: 'created_by',
      render: (task) => <span className={`badge ${task.created_name}`}>{task.created_name}</span>,
    },
    {
      label: 'Deadline',
      key: 'deadline',
      render: (task) => {
        const isOverdue =
          task.deadline && task.status !== 'done' && task.deadline.slice(0, 10) < today;
        return (
          <span className={isOverdue ? 'overdue' : ''}>
            {formatDate(task.deadline)}
            {isOverdue ? ' (overdue)' : ''}
          </span>
        );
      },
    },
    {
      label: 'Status',
      key: 'status',
      render: (task) => (
        <select
          className={`status-select ${task.status}`}
          value={task.status}
          onChange={(e) => updateTask(task, { status: e.target.value })}
        >
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </select>
      ),
    },
    // The Delete column exists only for an admin
    ...(isAdmin
      ? [
          {
            label: '',
            render: (task) => (
              <button className="btn-delete" onClick={() => deleteTask(task.id)}>
                Delete
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="page">
      <div className="page-header header-row">
        <div>
          <h1>Task Manager</h1>
          <p>
            Welcome, {user.name}{' '}
            <span className={`badge ${isAdmin ? 'high' : 'low'}`}>{isAdmin ? 'Admin' : 'User'}</span>
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="btn-primary" onClick={() => navigate('/users')}>
              Users
            </button>
          )}
          <button className="btn-delete" onClick={onLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">{isAdmin ? 'Total tasks' : 'My tasks'}</div>
        </div>
        <div className="stat todo">
          <div className="stat-number">{stats.todo}</div>
          <div className="stat-label">To do</div>
        </div>
        <div className="stat progress">
          <div className="stat-number">{stats.in_progress}</div>
          <div className="stat-label">In progress</div>
        </div>
        <div className="stat done">
          <div className="stat-number">{stats.done}</div>
          <div className="stat-label">Done</div>
        </div>
      </div>

      <div className="card">
        <h2>Add a task</h2>
        <form className="task-form" onSubmit={addTask}>
          <input
            className="grow"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            required
          />
          {isAdmin && (
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Assign to...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          <button className="btn-primary" type="submit">
            Add task
          </button>
        </form>
      </div>

      <div className="card">
        <h2>{isAdmin ? 'All tasks' : 'My tasks'}</h2>
        <DataTable url={API} dataKey="tasks" columns={columns} reloadKey={reloadKey} />
      </div>
    </div>
  );
}

export default App;