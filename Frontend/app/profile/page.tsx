'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import ThemeToggle from '@/components/ThemeToggle';
import { LockClosedIcon, CheckIcon, Cross2Icon, MagicWandIcon } from '@radix-ui/react-icons';
import { AvatarGradientIcon, AvatarIconVariant } from '@/components/ui/AvatarGradientIcon';

const AVATAR_OPTIONS: Array<{
  id: string;
  name: string;
  styleName: string;
  variant: AvatarIconVariant;
}> = [
  {
    id: 'cyan-blue',
    name: 'Cyan Orb',
    styleName: 'Soft Cyan-Blue Squircle',
    variant: 'cyan-blue',
  },
  {
    id: 'purple-magenta',
    name: 'Magenta Orb',
    styleName: 'Vibrant Purple Squircle',
    variant: 'purple-magenta',
  },
  {
    id: 'coral-orange',
    name: 'Coral Orb',
    styleName: 'Warm Coral Sphere',
    variant: 'coral-orange',
  },
  {
    id: 'emerald-teal',
    name: 'Emerald Status',
    styleName: 'Mint Circle + Active Dot',
    variant: 'emerald-teal',
  },
];

export default function Profile() {
  const { user, logout, loading: authLoading } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<string>('cyan-blue');

  useEffect(() => {
    const saved = localStorage.getItem('user_profile_avatar');
    if (saved) {
      setSelectedAvatar(saved);
    }
  }, []);

  const handleSelectAvatar = (avatarId: string) => {
    setSelectedAvatar(avatarId);
    localStorage.setItem('user_profile_avatar', avatarId);
  };

  const currentAvatarData = AVATAR_OPTIONS.find((a) => a.id === selectedAvatar) || AVATAR_OPTIONS[0];

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      await apiClient.changePassword(currentPassword, newPassword, confirmPassword);
      setMessage('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-10">
        <div className="max-w-3xl mx-auto space-y-8">
          <div className="flex justify-between items-center pb-6 border-b border-border/60">
            <div className="space-y-2">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-10 w-32 rounded-xl" />
              <Skeleton className="h-10 w-24 rounded-xl" />
            </div>
          </div>
          <div className="p-8 bg-card/40 border border-border/60 rounded-2xl space-y-6">
            <Skeleton className="h-6 w-36" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans p-6 md:p-10">
      <div className="max-w-3xl mx-auto">
        {/* Navigation Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10 pb-6 border-b border-border/60">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Account Profile</h1>
            <p className="text-sm text-muted-foreground mt-1">Manage your credentials, avatars and preferences</p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-card border border-border hover:bg-accent text-foreground text-sm font-medium rounded-xl transition-all flex items-center gap-2 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Dashboard</span>
            </Link>
            <button
              onClick={logout}
              className="px-4 py-2 bg-destructive/10 border border-destructive/30 hover:bg-destructive text-destructive hover:text-destructive-foreground text-sm font-medium rounded-xl transition-all"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Profile Avatar Picker Card */}
        <div className="bg-card/70 backdrop-blur-xl rounded-2xl border border-border/60 p-8 shadow-xl mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
                <MagicWandIcon className="w-4 h-4" />
              </span>
              <span>Select Profile Avatar Icon</span>
            </h2>
            <span className="text-xs px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary font-semibold">
              4 Vibrant Gradient Orbs
            </span>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            Select one of these four gradient avatar icons to customize your profile identity across VaultMind.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {AVATAR_OPTIONS.map((avatar) => {
              const isSelected = selectedAvatar === avatar.id;
              return (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => handleSelectAvatar(avatar.id)}
                  className={`relative p-6 rounded-2xl border transition-all flex flex-col items-center justify-center gap-3 text-center cursor-pointer group ${
                    isSelected
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'border-border/60 bg-background/50 hover:bg-accent hover:border-primary/40'
                  }`}
                >
                  {isSelected && (
                    <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs shadow-md z-10">
                      <CheckIcon className="w-3.5 h-3.5" />
                    </span>
                  )}

                  {/* Render exact visual gradient icon */}
                  <AvatarGradientIcon variant={avatar.variant} size="lg" />

                  <div>
                    <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                      {avatar.name}
                    </h4>
                    <span className="text-[10px] text-muted-foreground">{avatar.styleName}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Account Info Card */}
        <div className="bg-card/70 backdrop-blur-xl rounded-2xl border border-border/60 p-8 shadow-xl mb-8">
          <div className="flex items-center gap-4 mb-6">
            {/* Active Selected Gradient Icon Display */}
            <AvatarGradientIcon variant={currentAvatarData.variant} size="xl" />

            <div>
              <h2 className="text-xl font-bold">{user?.username || 'VaultMind User'}</h2>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Username
              </label>
              <div className="px-4 py-3 bg-background/80 border border-border rounded-xl text-foreground font-medium text-sm">
                {user?.username || '—'}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Email Address
              </label>
              <div className="px-4 py-3 bg-background/80 border border-border rounded-xl text-foreground font-medium text-sm">
                {user?.email || '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Security / Password Card */}
        <div className="bg-card/70 backdrop-blur-xl rounded-2xl border border-border/60 p-8 shadow-xl">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-center text-primary">
              <LockClosedIcon className="w-4 h-4" />
            </span>
            <span>Change Password</span>
          </h2>

          {message && (
            <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-xl text-primary text-sm flex items-center gap-2">
              <CheckIcon className="w-5 h-5 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-sm flex items-center gap-2">
              <Cross2Icon className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleChangePassword} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Current Password
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 bg-background/80 border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                placeholder="Enter current password"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                New Password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-background/80 border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                placeholder="At least 5 characters"
                minLength={5}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Confirm New Password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-background/80 border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-sm"
                placeholder="Confirm new password"
                minLength={5}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 text-sm flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
                  <span>Updating Password...</span>
                </>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
