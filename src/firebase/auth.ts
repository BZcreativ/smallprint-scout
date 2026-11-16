import { useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { auth } from "./app";

export function signInWithGoogle(): Promise<User> {
  return signInWithPopup(auth, new GoogleAuthProvider()).then((result) => result.user);
}

export function signOutUser(): Promise<void> {
  return signOut(auth);
}

/** `undefined` while Firebase restores the session, `null` when signed out. */
export function useAuthUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}
