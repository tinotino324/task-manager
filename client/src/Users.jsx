import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from './api';
import DataTable from './DataTable';

const API         = 'http://localhost:5000/api/users';
const ROLE_ADMIN  = 1;
const EMPTY_FORM  = { name: '', email: '', password: '', role: '2' };


function Users({ user }) {
  const isAdmin                   = user?.role === ROLE_ADMIN;
  const [users, setUsers]         = useState([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving]       = useState(false);
  const [editingUser, setEditingUser] = useState(null); // null = adding a new user
  const [tableError, setTableError]   = useState('');
  const navigate                  = useNavigate();

  function refresh() 
  {
    setReloadKey((k) => k + 1);
  }

  // Changes one field of the Add / Edit user form
  function changeField(e)
  {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function toggleForm()
  {
    setShowForm(!showForm);
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError('');
  }

  // Opens the same form, filled with this user's details (password left empty)
  function startEdit(row)
  {
    setEditingUser(row);
    setForm({ name: row.name, email: row.email, password: '', role: String(row.role) });
    setFormError('');
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Adding sends POST /api/users; editing sends PUT /api/users/:id
  async function saveUser(e)
  {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      const body = { ...form, role: Number(form.role) };
      if (editingUser && !body.password) delete body.password; // empty = keep the old password

      const res  = await apiFetch(editingUser ? `${API}/${editingUser.id}` : API, {
        method: editingUser ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || 'Could not save the user');
        return;
      }
      if (editingUser) {
        setEditingUser(null);
        setShowForm(false);
      }
      setForm(EMPTY_FORM);
      refresh();
    } catch {
      setFormError('Could not reach the server');
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(row)
  {
    if (!window.confirm(`Delete the user "${row.name}"? Their tasks will be kept but unassigned.`)) return;
    setTableError('');
    try {
      const res  = await apiFetch(`${API}/${row.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTableError(data.error || 'Could not delete the user');
        return;
      }
      if (editingUser?.id === row.id) toggleForm(); // close the form if it was editing this user
      refresh();
    } catch {
      setTableError('Could not reach the server');
    }
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
    },
    // The Actions column exists only for an admin
    ...(isAdmin
      ? [
          {
            label: 'Actions',
            render: (row) => (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-primary" onClick={() => startEdit(row)}>
                  Edit
                </button>
                {/* An admin cannot delete their own account */}
                {row.id !== user.id && (
                  <button className="btn-delete" onClick={() => deleteUser(row)}>
                    Delete
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
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

      {isAdmin && (
        <div className="card">
          <div className="header-row">
            <h2>{editingUser ? `Edit ${editingUser.name}` : 'Add a user'}</h2>
            <button className={showForm ? 'btn-delete' : 'btn-primary'} onClick={toggleForm}>
              {showForm ? 'Cancel' : 'Add user'}
            </button>
          </div>
          {showForm && (
            <form className="task-form" onSubmit={saveUser}>
              {formError && <div className="error-box" style={{ width: '100%' }}>{formError}</div>}
              <input className="grow" name="name" value={form.name} onChange={changeField} placeholder="Name" required />
              <input className="grow" type="email" name="email" value={form.email} onChange={changeField} placeholder="Email" required />
              <input
                className="grow"
                type="password"
                name="password"
                value={form.password}
                onChange={changeField}
                placeholder={editingUser ? 'New password (leave empty to keep)' : 'Password (min 6 characters)'}
                minLength={6}
                required={!editingUser}
                autoComplete="new-password"
              />
              <select name="role" value={form.role} onChange={changeField}>
                <option value="2">User</option>
                <option value="1">Admin</option>
              </select>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving...' : editingUser ? 'Save changes' : 'Save user'}
              </button>
            </form>
          )}
        </div>
      )}

      <div className="card dataTables_wrapper">
        <div className="card">
        <h2>All Users</h2>
        {tableError && <div className="error-box" style={{ marginBottom: 12 }}>{tableError}</div>}
        <DataTable url={API} dataKey="tasks" columns={columns} reloadKey={reloadKey} />
        </div>
      </div>
    </div>
  );
}

export default Users;