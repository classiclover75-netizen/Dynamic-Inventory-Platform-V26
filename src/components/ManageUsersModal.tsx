import React, { useEffect, useState } from 'react';
import { Button, Input, Modal } from './ui';
import { Trash2, UserPlus } from 'lucide-react';
import { useToast } from './ToastProvider';

interface ManagedUser {
  username: string;
  role: 'master' | 'slave';
  createdAt: string;
}

export const ManageUsersModal = React.memo(({
  isOpen,
  onClose
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/users', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data.users) ? data.users : []);
      } else {
        toast('Failed to load users');
      }
    } catch {
      toast('Failed to load users');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      setNewUsername('');
      setNewPassword('');
    }
  }, [isOpen]);

  const handleCreate = async () => {
    if (creating) return;
    const username = newUsername.trim();
    if (username.length < 3) return toast('Username must be at least 3 characters');
    if (newPassword.length < 8) return toast('Password must be at least 8 characters');

    setCreating(true);
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        toast(`User "${username}" created`);
        setNewUsername('');
        setNewPassword('');
        await loadUsers();
      } else {
        toast(data.error || 'Failed to create user');
      }
    } catch {
      toast('Failed to create user');
    }
    setCreating(false);
  };

  const handleDelete = async (username: string) => {
    try {
      const res = await fetch(`/api/auth/users/${encodeURIComponent(username)}`, {
        method: 'DELETE',
        credentials: 'same-origin'
      });
      const data = await res.json();
      if (res.ok) {
        toast(`User "${username}" removed`);
        await loadUsers();
      } else {
        toast(data.error || 'Failed to remove user');
      }
    } catch {
      toast('Failed to remove user');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="👤 Manage Users" width="min(520px, 96vw)">
      <div className="mb-4 border border-[#e1e7ea] rounded-md p-3 bg-[#fcfdfe]">
        <div className="text-xs font-bold text-[#607d8b] mb-2">Add a new user</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <Input
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder="Username"
          />
          <Input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Password (min 8 chars)"
          />
        </div>
        <Button variant="blue" onClick={handleCreate} disabled={creating}>
          <UserPlus size={14} /> {creating ? 'Creating...' : 'Add User'}
        </Button>
      </div>

      <div className="text-xs font-bold text-[#607d8b] mb-2">Existing users</div>
      {loading ? (
        <div className="text-xs text-[#90a4ae]">Loading...</div>
      ) : users.length === 0 ? (
        <div className="text-xs text-[#90a4ae]">No users found.</div>
      ) : (
        <div className="space-y-1.5 max-h-[240px] overflow-auto">
          {users.map((u) => (
            <div
              key={u.username}
              className="flex items-center justify-between border border-[#e1e7ea] rounded-md p-2 bg-white"
            >
              <div>
                <div className="text-xs font-bold text-[#263238]">{u.username}</div>
                <div className="text-[10px] uppercase tracking-wide text-[#90a4ae]">{u.role}</div>
              </div>
              {u.role === 'master' ? (
                <span className="text-[10px] font-bold text-[#90a4ae] px-2">Cannot be removed</span>
              ) : (
                <Button variant="red" onClick={() => handleDelete(u.username)}>
                  <Trash2 size={14} /> Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-end sticky bottom-0 bg-white py-3 border-t border-gray-100 z-10 -mb-1">
        <Button variant="red" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
});
