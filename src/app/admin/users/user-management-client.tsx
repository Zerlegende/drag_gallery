"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Trash2, Shield, User as UserIcon, Plus, Upload as UploadIcon, Pencil, Eye, EyeOff, MoreVertical, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type User = {
  id: string;
  username: string;
  role: string;
  avatar: string | null;
  created_at: string;
};

export function UserManagementClient({ 
  users, 
  currentUserId 
}: { 
  users: User[]; 
  currentUserId: string;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<{ id: string; username: string } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "user" });
  const [editUsername, setEditUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  async function handleCreateUser(e: React.SyntheticEvent) {
    e.preventDefault();
    setCreating(true);

    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create user");
      }
      
      setDialogOpen(false);
      setNewUser({ username: "", password: "", role: "user" });
      setShowPassword(false);
      showToast("success", "User erfolgreich erstellt");
      router.refresh();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Fehler beim Erstellen des Users");
    } finally {
      setCreating(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) throw new Error("Failed to update role");
      
      showToast("success", "Rolle erfolgreich geändert");
      router.refresh();
    } catch (error) {
      showToast("error", "Fehler beim Ändern der Rolle");
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete(userId: string) {
    setLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete user");
      
      showToast("success", "User erfolgreich gelöscht");
      router.refresh();
    } catch (error) {
      showToast("error", "Fehler beim Löschen des Users");
    } finally {
      setLoading(null);
    }
  }

  const confirmDelete = () => {
    if (deleteConfirmUser) {
      handleDelete(deleteConfirmUser.id);
      setDeleteConfirmUser(null);
    }
  };

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!selectedUserId) return;
    
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      showToast("warning", "Bitte wähle ein Bild aus");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      showToast("warning", "Bild ist zu groß (max 5MB)");
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("userId", selectedUserId);

      const response = await fetch("/api/users/avatar", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upload fehlgeschlagen");
      }

      setAvatarDialogOpen(false);
      setSelectedUserId(null);
      showToast("success", "Avatar erfolgreich hochgeladen");
      router.refresh();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Upload fehlgeschlagen");
    } finally {
      setUploadingAvatar(false);
    }
  }

  function openAvatarDialog(userId: string) {
    setSelectedUserId(userId);
    setAvatarDialogOpen(true);
  }

  function openEditDialog(user: User) {
    setSelectedUserId(user.id);
    setEditUsername(user.username);
    setEditDialogOpen(true);
  }

  function openPasswordDialog(user: User) {
    setSelectedUserId(user.id);
    setNewPassword("");
    setShowNewPassword(false);
    setPasswordDialogOpen(true);
  }

  async function handleUpdateUsername(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!selectedUserId || !editUsername.trim()) return;

    setUpdating(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: editUsername.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update username");
      }

      setEditDialogOpen(false);
      setSelectedUserId(null);
      setEditUsername("");
      showToast("success", "Username erfolgreich geändert");
      router.refresh();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Fehler beim Ändern des Usernamens");
    } finally {
      setUpdating(false);
    }
  }

  async function handleUpdatePassword(e: React.SyntheticEvent) {
    e.preventDefault();
    if (!selectedUserId || !newPassword.trim()) return;

    setUpdatingPassword(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUserId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update password");
      }

      setPasswordDialogOpen(false);
      setSelectedUserId(null);
      setNewPassword("");
      setShowNewPassword(false);
      showToast("success", "Passwort erfolgreich geändert");
      router.refresh();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Fehler beim Ändern des Passworts");
    } finally {
      setUpdatingPassword(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Neuer User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Neuen User erstellen</DialogTitle>
              <DialogDescription>
                Erstelle einen neuen Benutzer mit Username, Passwort und Rolle.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="new-username">Username</Label>
                  <Input
                    id="new-username"
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="username"
                    required
                    disabled={creating}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Passwort</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                      placeholder="••••••••"
                      required
                      disabled={creating}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-accent transition-colors"
                      disabled={creating}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-role">Role</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(value: string) => setNewUser({ ...newUser, role: value })}
                    disabled={creating}
                  >
                    <SelectTrigger id="new-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">
                        <div className="flex items-center gap-2">
                          <UserIcon className="h-3 w-3" />
                          User
                        </div>
                      </SelectItem>
                      <SelectItem value="moderator">
                        <div className="flex items-center gap-2">
                          <Shield className="h-3 w-3 text-blue-500" />
                          Moderator
                        </div>
                      </SelectItem>
                      <SelectItem value="admin">
                        <div className="flex items-center gap-2">
                          <Shield className="h-3 w-3" />
                          Admin
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setDialogOpen(false);
                    setShowPassword(false);
                  }} 
                  disabled={creating}
                >
                  Abbrechen
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? "Erstellen..." : "Erstellen"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="w-full rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Avatar</TableHead>
            <TableHead>Username</TableHead>
            <TableHead>Role</TableHead>
            <TableHead className="hidden sm:table-cell">Erstellt am</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isCurrentUser = user.id === currentUserId;
            const isLoading = loading === user.id;
            const avatarUrl = user.avatar ? `${process.env.NEXT_PUBLIC_MINIO_BASE_URL}/${user.avatar}` : null;

            return (
              <TableRow key={user.id}>
                <TableCell>
                  <button
                    onClick={() => openAvatarDialog(user.id)}
                    className="relative h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0 border-2 border-border hover:border-primary transition-colors group"
                  >
                    {avatarUrl ? (
                      <img 
                        src={avatarUrl} 
                        alt={user.username} 
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <UserIcon className="h-5 w-5 text-muted-foreground group-hover:text-primary" />
                    )}
                  </button>
                </TableCell>
                <TableCell className="font-medium">
                  {user.username}
                  {isCurrentUser && (
                    <span className="ml-2 text-xs text-muted-foreground">(Du)</span>
                  )}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isCurrentUser || isLoading}
                        className="h-8 w-8 p-0"
                        title={user.role}
                      >
                        {user.role === "admin" && <Shield className="h-4 w-4" />}
                        {user.role === "moderator" && <Shield className="h-4 w-4 text-blue-500" />}
                        {user.role === "user" && <UserIcon className="h-4 w-4" />}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => handleRoleChange(user.id, "admin")}>
                        <Shield className="h-3 w-3" /> Admin
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRoleChange(user.id, "moderator")}>
                        <Shield className="h-3 w-3 text-blue-500" /> Moderator
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleRoleChange(user.id, "user")}>
                        <UserIcon className="h-3 w-3" /> User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-muted-foreground">
                  {new Date(user.created_at).toLocaleDateString("de-DE")}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={isLoading} className="h-8 w-8 p-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditDialog(user)}>
                        <Pencil className="h-4 w-4" />
                        Username bearbeiten
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openPasswordDialog(user)}>
                        <KeyRound className="h-4 w-4" />
                        Passwort ändern
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openAvatarDialog(user.id)}>
                        <UserIcon className="h-4 w-4" />
                        Avatar ändern
                      </DropdownMenuItem>
                      {!isCurrentUser && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteConfirmUser({ id: user.id, username: user.username })}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                            Löschen
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>

      {/* Avatar Upload Dialog */}
      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avatar ändern</DialogTitle>
            <DialogDescription>
              Lade ein neues Profilbild für diesen Benutzer hoch.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="avatar-upload" className="cursor-pointer">
              <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-8 hover:border-primary transition-colors">
                <UploadIcon className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {uploadingAvatar ? "Wird hochgeladen..." : "Bild auswählen (max 5MB)"}
                </span>
              </div>
              <Input
                id="avatar-upload"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                disabled={uploadingAvatar}
                className="hidden"
              />
            </Label>
          </div>
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => {
                setAvatarDialogOpen(false);
                setSelectedUserId(null);
              }}
              disabled={uploadingAvatar}
            >
              Abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Username Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Username bearbeiten</DialogTitle>
            <DialogDescription>
              Ändere den Usernamen für diesen Benutzer.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdateUsername}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-username">Neuer Username</Label>
                <Input
                  id="edit-username"
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="username"
                  required
                  disabled={updating}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setEditDialogOpen(false);
                  setSelectedUserId(null);
                  setEditUsername("");
                }}
                disabled={updating}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={updating || !editUsername.trim()}>
                {updating ? "Speichern..." : "Speichern"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Passwort ändern</DialogTitle>
            <DialogDescription>
              Setze ein neues Passwort für diesen Benutzer.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdatePassword}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Neues Passwort</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={updatingPassword}
                    autoFocus
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                    disabled={updatingPassword}
                    tabIndex={-1}
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setPasswordDialogOpen(false);
                  setSelectedUserId(null);
                  setNewPassword("");
                  setShowNewPassword(false);
                }}
                disabled={updatingPassword}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={updatingPassword || !newPassword.trim()}>
                {updatingPassword ? "Speichern..." : "Speichern"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={deleteConfirmUser !== null}
        onOpenChange={(open) => !open && setDeleteConfirmUser(null)}
        title="User löschen"
        description={`Möchtest du den User "${deleteConfirmUser?.username}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmText="Löschen"
        cancelText="Abbrechen"
        variant="destructive"
        onConfirm={confirmDelete}
      />
    </div>
  );
}
