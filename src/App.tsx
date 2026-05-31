import { useState, useEffect, useRef, FormEvent } from "react";
import { 
  Mic, 
  MicOff, 
  Users, 
  ReceiptText, 
  ArrowRight, 
  CheckCircle, 
  TrendingUp, 
  Sparkles,
  Loader2,
  FolderOpen,
  Plus,
  Edit2,
  X,
  CreditCard,
  UserCheck,
  Mail,
  Search,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Inbox,
  Trash2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Expense, Group } from "./types";
import { calculateDebts } from "./utils";
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  handleFirestoreError,
  OperationType 
} from "./firebase";
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp,
  getDocs,
  getDoc,
  updateDoc
} from "firebase/firestore";

interface Member {
  name: string;
  email?: string;
  uid?: string;
}

export default function App() {
  // Auth states
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  const [registeredUsers, setRegisteredUsers] = useState<any[]>([]);

  // Group selection states
  const [groups, setGroups] = useState<any[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>("homies");
  const [activeGroupData, setActiveGroupData] = useState<any>(null);
  const [isGroupDropdownOpen, setIsGroupDropdownOpen] = useState(false);

  // Group creation states
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Member management states
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [emailSearchQuery, setEmailSearchQuery] = useState("");
  const [filteredSuggestions, setFilteredSuggestions] = useState<any[]>([]);
  const [modalSuccess, setModalSuccess] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Simulation lists for notifications & testing
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [simulatedInboxUser, setSimulatedInboxUser] = useState<string | null>(null);

  // Active Ledger log & calculations
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>("active_session");
  const [activeLedgerData, setActiveLedgerData] = useState<any>({ id: "active_session", name: "Active Session" });
  const [activeExpenses, setActiveExpenses] = useState<Expense[]>([]);
  const [allGroupLedgers, setAllGroupLedgers] = useState<any[]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [archiveTitle, setArchiveTitle] = useState<string>("");
  const [showArchiveModal, setShowArchiveModal] = useState<boolean>(false);

  // Microphone toggle state & user context
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [manualText, setManualText] = useState("");

  const [ownerName, setOwnerName] = useState<string>(() => {
    return localStorage.getItem("voice_split_owner_name") || "Kaushik";
  });
  const [isEditingOwner, setIsEditingOwner] = useState<boolean>(false);
  const [tempCardOwnerName, setTempCardOwnerName] = useState<string>("Kaushik");

  // Speech Recognition Refs
  const recognitionRef = useRef<any>(null);
  const accumulatedTranscriptRef = useRef<string>("");

  // Clean success message timeout
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Auth changed listener & Register user details on database
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        setIsAuthLoading(false);

        // Record User details for suggestions matching search later
        try {
          const userEmail = user.email || "";
          const userDisplayName = user.displayName || userEmail.split("@")[0] || "User";
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            displayName: userDisplayName,
            email: userEmail
          }, { merge: true });
        } catch (err) {
          console.error("Failed recording profile registry:", err);
        }
      } else {
        setCurrentUser(null);
        setIsAuthLoading(false);
        setActiveGroupId("homies");
      }
    });
    return () => unsub();
  }, []);

  // Listen to list of registered users for real-time type-ahead filtering
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        uid: docSnap.id,
        ...docSnap.data()
      }));
      setRegisteredUsers(list);
    });
    return () => unsub();
  }, [currentUser]);

  // Listen to simulated pending invitations for Dev Showcase control panel
  useEffect(() => {
    if (!currentUser) return;
    const unsub = onSnapshot(collection(db, "invitations"), (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));
      setPendingInvites(list);
    });
    return () => unsub();
  }, [currentUser]);

  // Check and process invitation automatic joins on Login
  useEffect(() => {
    if (!currentUser?.email) return;

    const handleAutoJoinInvitations = async () => {
      try {
        const mailLower = currentUser.email.toLowerCase().trim();
        const inviteQuery = query(
          collection(db, "invitations"),
          where("email", "==", mailLower)
        );
        const snapshot = await getDocs(inviteQuery);

        if (!snapshot.empty) {
          let joinedNames: string[] = [];
          for (const inviteDoc of snapshot.docs) {
            const data = inviteDoc.data();
            const groupId = data.groupId;

            // Update parent group
            const groupRef = doc(db, "groups", groupId);
            const groupSnap = await getDoc(groupRef);

            if (groupSnap.exists()) {
              const currentGroup = groupSnap.data();
              const oldMembers = currentGroup.members || [];
              const oldUids = currentGroup.memberUids || [];

              // Link User account
              let updated = false;
              const updatedMembers = oldMembers.map((m: any) => {
                if (m.email?.toLowerCase().trim() === mailLower) {
                  updated = true;
                  return { ...m, uid: currentUser.uid };
                }
                return m;
              });

              if (!updated) {
                updatedMembers.push({
                  name: data.nameInGroup || currentUser.displayName || "New Member",
                  email: mailLower,
                  uid: currentUser.uid
                });
              }

              const updatedUids = Array.from(new Set([...oldUids, currentUser.uid]));

              await updateDoc(groupRef, {
                members: updatedMembers,
                memberUids: updatedUids,
                updatedAt: serverTimestamp()
              });

              joinedNames.push(data.groupName || "New Group");
              await deleteDoc(doc(db, "invitations", inviteDoc.id));
            }
          }

          if (joinedNames.length > 0) {
            setSuccessMsg(`🎉 Welcome! You have been automatically added to group: ${joinedNames.join(", ")}`);
          }
        }
      } catch (err) {
        console.error("Failed processing auto invitations on login", err);
      }
    };

    handleAutoJoinInvitations();
  }, [currentUser]);

  // Sync groups list: Offline or Realtime Firestore Subscription
  useEffect(() => {
    if (!currentUser) {
      // Local fallback representation
      const localGroupsValue = localStorage.getItem("voice_split_groups");
      if (localGroupsValue) {
        try {
          const parsed = JSON.parse(localGroupsValue);
          setGroups(parsed);
          if (parsed.length > 0) {
            setActiveGroupId(parsed[0].id);
          }
        } catch {
          setGroups([{ id: "homies", name: "homies", members: [{ name: ownerName }] }]);
        }
      } else {
        const initial = [{ id: "homies", name: "homies", members: [{ name: ownerName }] }];
        setGroups(initial);
        localStorage.setItem("voice_split_groups", JSON.stringify(initial));
        setActiveGroupId("homies");
      }
      return;
    }

    // Subscribe to Google Firestore real-time groups that current user is member of
    const q = query(
      collection(db, "groups"),
      where("memberUids", "array-contains", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const list = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      // If user has NO groups in database, initialize a default group named "homies"
      if (list.length === 0) {
        try {
          const defaultId = "group_homies_" + Math.random().toString(36).substring(2, 9);
          await setDoc(doc(db, "groups", defaultId), {
            ownerId: currentUser.uid,
            name: "homies",
            members: [{ name: ownerName, email: currentUser.email, uid: currentUser.uid }],
            memberUids: [currentUser.uid],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          setActiveGroupId(defaultId);
        } catch (err) {
          console.error("Could not construct default database group:", err);
        }
      } else {
        setGroups(list);
        // Fallback active group boundary check
        const stillExists = list.some(g => g.id === activeGroupId);
        if (!stillExists && list.length > 0) {
          setActiveGroupId(list[0].id);
        }
      }
    });

    return () => unsubscribe();
  }, [currentUser, activeGroupId]);

  // Synchronize Active Group Details
  useEffect(() => {
    if (!activeGroupId) return;

    if (!currentUser) {
      const localGrp = groups.find(g => g.id === activeGroupId);
      if (localGrp) {
        setActiveGroupData(localGrp);
      }
      return;
    }

    if (activeGroupId === "homies") return; // Skip if in transition state

    const unsub = onSnapshot(doc(db, "groups", activeGroupId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setActiveGroupData({ id: snap.id, ...data });
      }
    });
    return () => unsub();
  }, [activeGroupId, groups, currentUser]);

  // Sync Active Session details: offline and real-time Firestore synchronization
  useEffect(() => {
    if (!currentUser) {
      setActiveLedgerId("local_ledger");
      setActiveLedgerData({ id: "local_ledger", name: "Active Session" });
      return;
    }

    if (activeGroupId === "homies" || !activeGroupId) {
      setActiveLedgerId("active_session");
      setActiveLedgerData({ id: "active_session", name: "Active Session" });
      return;
    }

    setActiveLedgerId("active_session");
    setActiveLedgerData({ id: "active_session", name: "Active Session" });

    // Ensure the ledger document "active_session" exists in Firestore under the group
    const ensureLedgerDocument = async () => {
      try {
        const ledgerRef = doc(db, "groups", activeGroupId, "ledgers", "active_session");
        const snap = await getDoc(ledgerRef);
        if (!snap.exists()) {
          await setDoc(ledgerRef, {
            ownerId: currentUser.uid,
            name: "Active Session",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      } catch (err) {
        console.error("Failed ensuring default active session document:", err);
      }
    };
    ensureLedgerDocument();
  }, [currentUser, activeGroupId]);

  // Subscribe to active ledger expenses list (for local or cloud)
  useEffect(() => {
    if (!activeLedgerId) return;

    if (!currentUser) {
      // Local offline loading of active expenses
      const savedExp = localStorage.getItem(`voice_split_exp_${activeGroupId}`);
      try {
        setActiveExpenses(savedExp ? JSON.parse(savedExp) : []);
      } catch {
        setActiveExpenses([]);
      }
      return;
    }

    if (activeGroupId === "homies") return;

    const unsub = onSnapshot(collection(db, "groups", activeGroupId, "ledgers", activeLedgerId, "expenses"), (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        name: d.data().name || "",
        amount: parseFloat(d.data().amount) || 0,
        description: d.data().description || "Spent",
        createdAt: d.data().createdAt
      }));

      // Sort client-side by logging order (ascending)
      list.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeA - timeB;
      });

      setActiveExpenses(list);
    });

    return () => unsub();
  }, [currentUser, activeGroupId, activeLedgerId]);

  // Load Historical Ledger Sessions for history
  useEffect(() => {
    if (!currentUser) {
      // Local historical ledgers
      const historicalJson = localStorage.getItem(`voice_split_history_${activeGroupId}`);
      try {
        setAllGroupLedgers(historicalJson ? JSON.parse(historicalJson) : []);
      } catch {
        setAllGroupLedgers([]);
      }
      return;
    }

    if (activeGroupId === "homies" || !activeGroupId) {
      setAllGroupLedgers([]);
      return;
    }

    // Subscribe to all ledgers under the group (excluding the active_session ID)
    const q = query(collection(db, "groups", activeGroupId, "ledgers"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs
        .map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        // Filter out the active_session placeholder so it only shows archived history
        .filter((led: any) => led.id !== "active_session");

      // Sort with most recent first (based on createdAt)
      list.sort((a: any, b: any) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setAllGroupLedgers(list);
    });

    return () => unsub();
  }, [currentUser, activeGroupId]);

  // Speech Recognition API Loop binding continuous listening
  useEffect(() => {
    const SpeechComp = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechComp) {
      const rec = new SpeechComp();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
        setErrorMsg(null);
        setTranscript("");
        accumulatedTranscriptRef.current = "";
      };

      rec.onerror = (e: any) => {
        console.error("Speech Recognition Error", e);
        if (e.error === "not-allowed") {
          setErrorMsg("Microphone permission denied. Try speaking through manual search box instead.");
        } else {
          setErrorMsg(`Voice decoding error: ${e.error}. Type directly.`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
        const text = accumulatedTranscriptRef.current.trim();
        if (text) {
          parseVoiceInput(text);
        }
      };

      rec.onresult = (ev: any) => {
        let textResult = "";
        for (let i = ev.resultIndex; i < ev.results.length; ++i) {
          if (ev.results[i].isFinal) {
            textResult += ev.results[i][0].transcript + " ";
          }
        }
        if (textResult) {
          accumulatedTranscriptRef.current += textResult;
          setTranscript(accumulatedTranscriptRef.current);
        }
      };

      recognitionRef.current = rec;
    }
  }, [activeGroupData, ownerName]);

  // Interactive Voice Microphone Toggle (Listen until pressed again)
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (err) {
          setErrorMsg("Could not initiate mic. Provide browser frame permissions.");
        }
      } else {
        setErrorMsg("Voice input is not supported in this browser. Fallback typing below!");
      }
    }
  };

  // Group creation action
  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    const gName = newGroupName.trim();
    if (!gName) return;

    if (!currentUser) {
      // Local create group
      const newG = {
        id: "local_group_" + Math.random().toString(36).substring(2, 9),
        name: gName,
        members: [{ name: ownerName }]
      };
      const updated = [...groups, newG];
      setGroups(updated);
      localStorage.setItem("voice_split_groups", JSON.stringify(updated));
      setActiveGroupId(newG.id);
      setNewGroupName("");
      setShowNewGroupModal(false);
      setSuccessMsg(`Group "${gName}" created offline.`);
      return;
    }

    try {
      const gId = "group_" + Math.random().toString(36).substring(2, 11);
      await setDoc(doc(db, "groups", gId), {
        ownerId: currentUser.uid,
        name: gName,
        members: [{ name: ownerName, email: currentUser.email, uid: currentUser.uid }],
        memberUids: [currentUser.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setActiveGroupId(gId);
      setNewGroupName("");
      setShowNewGroupModal(false);
      setSuccessMsg(`Successfully created shared group: ${gName}`);
    } catch (err) {
      setErrorMsg("Failed creating shared group on Firestore.");
    }
  };

  // Add/Invite people flow
  const handleEmailInputChange = (val: string) => {
    setNewMemberEmail(val);
    if (!val.trim()) {
      setFilteredSuggestions([]);
      return;
    }
    
    // Look up registered user profiles by email starting string
    const match = registeredUsers.filter(u => 
      u.email?.toLowerCase().includes(val.toLowerCase()) || 
      u.displayName?.toLowerCase().includes(val.toLowerCase())
    );
    setFilteredSuggestions(match);
  };

  const handleSelectSuggestion = (userProfile: any) => {
    setNewMemberName(userProfile.displayName || "");
    setNewMemberEmail(userProfile.email || "");
    setFilteredSuggestions([]);
  };

  const handleAddMemberSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const mName = newMemberName.trim();
    const mEmail = newMemberEmail.trim().toLowerCase();

    // Reset alert states
    setModalError(null);
    setModalSuccess(null);

    if (!mName) {
      setModalError("Participant name is required");
      return;
    }

    // Check if member already in active group
    const currentList: Member[] = activeGroupData?.members || [];
    const alreadyExists = currentList.some(m => 
      m.name.toLowerCase() === mName.toLowerCase() || 
      (mEmail && m.email?.toLowerCase() === mEmail)
    );

    if (alreadyExists) {
      setModalError("A member with highly similar name or email is already registered in this group");
      return;
    }

    if (!currentUser) {
      // Local offline append
      const updatedMembers = [...currentList, { name: mName }];
      const updatedGroups = groups.map(g => {
        if (g.id === activeGroupId) {
          return { ...g, members: updatedMembers };
        }
        return g;
      });
      setGroups(updatedGroups);
      localStorage.setItem("voice_split_groups", JSON.stringify(updatedGroups));
      
      setModalSuccess(`Successfully added local participant: ${mName}`);
      setNewMemberName("");
      setNewMemberEmail("");
      setTimeout(() => {
        setShowAddMemberModal(false);
        setModalSuccess(null);
      }, 1500);
      return;
    }

    try {
      // If client provided matching email, find if they are registered state
      const matchingUser = registeredUsers.find(u => u.email?.toLowerCase() === mEmail);
      const isInvited = mEmail && !matchingUser;

      // Construct object without any "undefined" properties to prevent serialization issues
      const newMemberObj: Member = {
        name: mName
      };
      if (mEmail) {
        newMemberObj.email = mEmail;
      }
      if (matchingUser) {
        newMemberObj.uid = matchingUser.uid;
      }

      const updatedMembers = [...currentList, newMemberObj];
      const updatedUids = activeGroupData.memberUids ? [...activeGroupData.memberUids] : [];
      if (matchingUser) {
        updatedUids.push(matchingUser.uid);
      }

      await updateDoc(doc(db, "groups", activeGroupId), {
        members: updatedMembers,
        memberUids: Array.from(new Set(updatedUids)),
        updatedAt: serverTimestamp()
      });

      // Send Simulated Email invitation
      if (isInvited) {
        const inviteId = "invite_" + Math.random().toString(36).substring(2, 9);
        await setDoc(doc(db, "invitations", inviteId), {
          email: mEmail,
          groupId: activeGroupId,
          groupName: activeGroupData.name,
          nameInGroup: mName,
          invitedBy: currentUser.displayName || currentUser.email || "Kaushik",
          createdAt: serverTimestamp()
        });

        setModalSuccess(`Invited ${mName}! Dispatching email outbox invitation to ${mEmail}`);
      } else {
        setModalSuccess(`Successfully added ${mName} to ${activeGroupData.name}!`);
      }

      setNewMemberName("");
      setNewMemberEmail("");
      
      // Auto close the modal after readable delay
      setTimeout(() => {
        setShowAddMemberModal(false);
        setModalSuccess(null);
      }, 1800);
    } catch (err) {
      console.error("Firestore user log failed:", err);
      setModalError("Failed logging new member addition on database.");
    }
  };



  // API Call utilizing Gemini to parse spoken words
  const parseVoiceInput = async (spokenText: string) => {
    if (!spokenText || spokenText.trim().length === 0) return;

    setIsProcessing(true);
    setErrorMsg(null);

    // Voice shortcut reset check
    const lowered = spokenText.toLowerCase().trim();
    if (lowered === "clear ledger" || lowered === "reset" || lowered === "reset ledger") {
      if (currentUser && activeGroupId !== "homies" && activeLedgerId) {
        try {
          for (const item of activeExpenses) {
            await deleteDoc(doc(db, "groups", activeGroupId, "ledgers", activeLedgerId, "expenses", item.id));
          }
          setSuccessMsg("Active database ledger expenses cleared.");
        } catch (err) {
          setErrorMsg("Could not clear active group database ledger.");
        }
      } else {
        // Local offline reset
        setActiveExpenses([]);
        localStorage.setItem(`voice_split_exp_${activeGroupId}`, JSON.stringify([]));
        setSuccessMsg("Local workspace cleared.");
      }
      setIsProcessing(false);
      setTranscript("");
      return;
    }

    const memberNames = (activeGroupData?.members || []).map((m: any) => m.name);

    try {
      const rep = await fetch("/api/parse-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: spokenText,
          existingMembers: memberNames,
          ownerName: ownerName
        })
      });

      if (!rep.ok) {
        throw new Error("Failed to receive valid JSON analysis from parser endpoint");
      }

      const resJson = await rep.json();
      const parsedList = resJson.expenses || [];

      if (parsedList.length > 0) {
        const generatedList: Expense[] = parsedList.map((e: any) => ({
          id: "exp_" + Math.random().toString(36).substring(2, 9),
          name: e.name,
          amount: parseFloat(e.amount) || 0,
          description: e.description || "Spent"
        }));

        // Dynamically auto-discover new members mentioned in transcript
        const suggested: string[] = resJson.suggestedParticipants || [];
        const combinedMembers = Array.from(new Set([...memberNames, ...suggested]));

        // Write to DB or Local fallback
        if (currentUser && activeGroupId !== "homies" && activeLedgerId) {
          // A. Sequential batch insert of parsed expenses
          for (const raw of generatedList) {
            await setDoc(doc(db, "groups", activeGroupId, "ledgers", activeLedgerId, "expenses", raw.id), {
              name: raw.name,
              amount: raw.amount,
              description: raw.description,
              createdAt: serverTimestamp()
            });
          }

          // B. Append newly recognized members to group
          const currentMembersList: Member[] = activeGroupData?.members || [];
          const newMembersToAppend = combinedMembers
            .filter(name => !currentMembersList.some(m => m.name.toLowerCase() === name.toLowerCase()))
            .map(name => ({ name }));

          if (newMembersToAppend.length > 0) {
            await updateDoc(doc(db, "groups", activeGroupId), {
              members: [...currentMembersList, ...newMembersToAppend],
              updatedAt: serverTimestamp()
            });
          }
        } else {
          // Local memory offline write
          const mergedExpenses = [...activeExpenses, ...generatedList];
          setActiveExpenses(mergedExpenses);
          localStorage.setItem(`voice_split_exp_${activeGroupId}`, JSON.stringify(mergedExpenses));

          // Append newly discovered members offline
          const currentMembersList = activeGroupData?.members || [];
          const newMembersToAppend = combinedMembers
            .filter(name => !currentMembersList.some((m: any) => m.name.toLowerCase() === name.toLowerCase()))
            .map(name => ({ name }));

          if (newMembersToAppend.length > 0) {
            const updatedMembers = [...currentMembersList, ...newMembersToAppend];
            const updatedGroups = groups.map(g => {
              if (g.id === activeGroupId) {
                return { ...g, members: updatedMembers };
              }
              return g;
            });
            setGroups(updatedGroups);
            localStorage.setItem("voice_split_groups", JSON.stringify(updatedGroups));
          }
        }

        setSuccessMsg(`Logged expenditure of: ${generatedList.map(e => `${e.name} ($${e.amount})`).join(", ")}`);
      } else {
        setErrorMsg("Gemini could not figure out split amounts. Repeat spender name and currency clearly.");
      }
    } catch (err: any) {
      console.error("Transcription parse failed:", err);
      setErrorMsg("Failed to analyze voice transcript. Repeat cleanly.");
    } finally {
      setIsProcessing(false);
      setTranscript("");
    }
  };

  const handleManualInputSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    parseVoiceInput(manualText);
    setManualText("");
  };

  const handleClearActiveLedger = async () => {
    setIsProcessing(true);
    if (currentUser && activeGroupId !== "homies" && activeLedgerId) {
      try {
        for (const item of activeExpenses) {
          await deleteDoc(doc(db, "groups", activeGroupId, "ledgers", activeLedgerId, "expenses", item.id));
        }
        setSuccessMsg("Active session expenses cleared.");
      } catch (err) {
        setErrorMsg("Could not clear active session database.");
      }
    } else {
      // Local offline reset
      setActiveExpenses([]);
      localStorage.setItem(`voice_split_exp_${activeGroupId}`, JSON.stringify([]));
      setSuccessMsg("Local workspace cleared.");
    }
    setShowResetConfirm(false);
    setIsProcessing(false);
  };

  const handleArchiveActiveLedger = async (e: FormEvent) => {
    e.preventDefault();
    if (activeExpenses.length === 0) {
      setErrorMsg("Cannot archive an empty session.");
      setShowArchiveModal(false);
      return;
    }

    const title = archiveTitle.trim() || `Session on ${new Date().toLocaleDateString()}`;
    const totalAmount = activeExpenses.reduce((sum, exp) => sum + exp.amount, 0);

    setIsProcessing(true);

    if (currentUser && activeGroupId !== "homies" && activeLedgerId) {
      try {
        const nextId = "led_hist_" + Math.random().toString(36).substring(2, 11);
        
        // 1. Create archived ledger document with embedded expenses array
        await setDoc(doc(db, "groups", activeGroupId, "ledgers", nextId), {
          ownerId: currentUser.uid,
          name: title,
          totalAmount,
          expenses: activeExpenses.map(exp => ({
            name: exp.name,
            amount: exp.amount,
            description: exp.description
          })),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        // 2. Delete all active session expenses from Firestore
        for (const item of activeExpenses) {
          await deleteDoc(doc(db, "groups", activeGroupId, "ledgers", activeLedgerId, "expenses", item.id));
        }

        setSuccessMsg(`Session archived as "${title}" and workspace cleared.`);
      } catch (err) {
        console.error(err);
        setErrorMsg("Could not archive active session database.");
      }
    } else {
      // Local offline archiving
      const localHistoryJson = localStorage.getItem(`voice_split_history_${activeGroupId}`);
      let localHistory: any[] = [];
      try {
        localHistory = localHistoryJson ? JSON.parse(localHistoryJson) : [];
      } catch {
        localHistory = [];
      }

      const newHistoryItem = {
        id: "local_hist_" + Math.random().toString(36).substring(2, 9),
        name: title,
        totalAmount,
        expenses: activeExpenses.map(exp => ({
          name: exp.name,
          amount: exp.amount,
          description: exp.description
        })),
        createdAt: { seconds: Math.floor(Date.now() / 1000) }
      };

      const updatedHistory = [newHistoryItem, ...localHistory];
      localStorage.setItem(`voice_split_history_${activeGroupId}`, JSON.stringify(updatedHistory));

      // Clear local active expenses
      setActiveExpenses([]);
      localStorage.setItem(`voice_split_exp_${activeGroupId}`, JSON.stringify([]));

      // Update state
      setAllGroupLedgers(updatedHistory);
      setSuccessMsg(`Session archived locally as "${title}".`);
    }

    setArchiveTitle("");
    setShowArchiveModal(false);
    setIsProcessing(false);
  };

  const handleOwnerNameUpdate = (newName: string) => {
    newName = newName.trim();
    if (!newName) return;
    setOwnerName(newName);
    localStorage.setItem("voice_split_owner_name", newName);

    // If online, match user profile
    if (currentUser) {
      setDoc(doc(db, "users", currentUser.uid), {
        displayName: newName
      }, { merge: true }).catch(err => console.error("Could not sync name to user profile:", err));
    }
  };

  // Google popup authentication flow
  const handleGoogleSignInTrigger = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Auth popup failed", err);
      setErrorMsg("Google login unsuccessful or interrupted.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogoutTrigger = async () => {
    try {
      await signOut(auth);
      setSuccessMsg("Logged out successfully. Transient memory fallback restored.");
    } catch (err) {
      setErrorMsg("Sign out failed");
    }
  };

  // Automated Dev Sandbox Authentication simulation
  const handleSimulateLogin = async (invitedEmail: string, invitedName: string) => {
    setIsProcessing(true);
    try {
      await signOut(auth);
      setSimulatedInboxUser(invitedEmail);
      setSuccessMsg(`Simulated sandbox mailbox: Auth session launched for "${invitedName}" (${invitedEmail})!`);
    } catch (err) {
      setErrorMsg("Could not mock sandbox signup.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateMockAccount = async (e: FormEvent) => {
    e.preventDefault();
    if (!simulatedInboxUser) return;

    setIsProcessing(true);
    try {
      // Build a mockup user object bypass
      // Since real popup requires real credentials, in our frontend we simulate user creation on users collection directly!
      // This allows them to search and toggle simulated profiles sequentially.
      const mockUid = "mock_user_" + Math.random().toString(36).substring(2, 9);
      
      // Seed details
      await setDoc(doc(db, "users", mockUid), {
        uid: mockUid,
        displayName: simulatedInboxUser.split("@")[0].toUpperCase(),
        email: simulatedInboxUser
      });

      // Force simulated user session inside state
      const mockUserObj = {
        uid: mockUid,
        email: simulatedInboxUser,
        displayName: simulatedInboxUser.split("@")[0].toUpperCase()
      };
      
      setCurrentUser(mockUserObj);
      setOwnerName(mockUserObj.displayName);
      setSimulatedInboxUser(null);
      setSuccessMsg(`Successfully registered & logged in as sandbox member "${mockUserObj.displayName}"! Checked invitations and linked groups!`);
    } catch (err) {
      setErrorMsg("Mock account generation failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  // CALCULATIONS ENGINE (Active Ledger split)
  const currentParticipantsList = activeGroupData?.members || [];
  const activeParticipantsNames = currentParticipantsList.map((m: any) => m.name);

  // Spent summary calculation
  const activeSpendMap: Record<string, number> = {};
  activeParticipantsNames.forEach(name => {
    activeSpendMap[name] = 0;
  });
  activeExpenses.forEach(e => {
    activeSpendMap[e.name] = (activeSpendMap[e.name] || 0) + e.amount;
  });

  const formattedActiveParticipants = activeParticipantsNames.map(name => ({
    name,
    totalSpent: activeSpendMap[name] || 0
  }));

  const activeTotalPool = activeExpenses.reduce((sum, e) => sum + e.amount, 0);
  const activeFairShare = activeParticipantsNames.length > 0 ? (activeTotalPool / activeParticipantsNames.length) : 0;
  
  // Debts inside active ledger
  const activeSettlements = calculateDebts(formattedActiveParticipants);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative pb-32">
      {/* Decorative Grid Balance lines in canvas background */}
      <div className="absolute inset-x-0 top-0 h-[600px] bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none opacity-50 border-b border-slate-200/40" />

      {/* TOP COMPONENT APP BAR HEADER */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 py-3.5 px-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.02)]">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          
          {/* LEFT: Dropdown Select of groups (starting with "homies") */}
          <div className="relative">
            <button 
              onClick={() => setIsGroupDropdownOpen(!isGroupDropdownOpen)}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200/80 border border-slate-250 py-1.5 px-4 rounded-xl text-sm font-bold text-slate-800 transition-all cursor-pointer shadow-xs active:scale-95"
              id="group-selector-btn"
            >
              <Users className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="truncate max-w-[125px]">
                {activeGroupData ? activeGroupData.name : "homies"}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-205 ${isGroupDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
              {isGroupDropdownOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  className="absolute left-0 mt-2 w-56 rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden z-25 text-left"
                >
                  <div className="p-1 px-2.5 pt-2 text-[10px] uppercase tracking-wider font-extrabold text-slate-400 block border-b border-slate-100 pb-1.5 mb-1 bg-slate-50">
                    Switch Group
                  </div>
                  <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                    {groups.map(g => (
                      <button 
                        key={g.id}
                        onClick={() => {
                          setActiveGroupId(g.id);
                          setIsGroupDropdownOpen(false);
                        }}
                        className={`w-full text-left font-bold text-xs p-2.5 rounded-xl block transition-all ${
                          activeGroupId === g.id 
                            ? "bg-slate-900 text-white" 
                            : "text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        👥 {g.name}
                      </button>
                    ))}
                  </div>

                  {/* Creator Action */}
                  <div className="p-1.5 pt-1 border-t border-slate-100 bg-slate-50/70">
                    <button 
                      onClick={() => {
                        setShowNewGroupModal(true);
                        setIsGroupDropdownOpen(false);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 font-bold text-xs py-2 bg-slate-250 hover:bg-slate-300 text-slate-800 rounded-xl transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add New Group</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* MIDDLE: Branding Title */}
          <div className="hidden sm:flex items-center gap-2">
            <h1 className="font-display font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent">
              RoamMate
            </h1>
            <span className="bg-slate-100 text-slate-500 text-[10px] uppercase font-mono font-bold tracking-wider px-1.5 py-0.5 rounded-md border border-slate-200/50">
              Balanced
            </span>
          </div>

          {/* RIGHT: User Profile Settings Button with instant name overlay toggle */}
          <div className="flex items-center gap-2">
            
            {/* Click to Edit Owner Name Badge */}
            {isEditingOwner ? (
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  handleOwnerNameUpdate(tempCardOwnerName);
                  setIsEditingOwner(false);
                }}
                className="flex items-center bg-white border border-indigo-400 shadow-sm px-2 py-0.5 rounded-xl ml-auto"
              >
                <input 
                  type="text"
                  value={tempCardOwnerName}
                  onChange={(e) => setTempCardOwnerName(e.target.value)}
                  className="w-16 bg-transparent text-xs font-bold text-slate-800 outline-none p-0.5 border-none focus:ring-0 focus:outline-none"
                  autoFocus
                  maxLength={15}
                  onBlur={() => {
                    handleOwnerNameUpdate(tempCardOwnerName);
                    setIsEditingOwner(false);
                  }}
                />
              </form>
            ) : (
              <button 
                onClick={() => {
                  setTempCardOwnerName(ownerName);
                  setIsEditingOwner(true);
                }}
                className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#475569] bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs hover:bg-slate-50 hover:text-slate-900 transition-colors shrink-0"
                title="Click to edit your name"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate max-w-[85px]">👤 me: <strong className="text-slate-800 font-bold">{ownerName}</strong></span>
              </button>
            )}

            {/* Authentications Switch */}
            {currentUser ? (
              <button 
                onClick={handleLogoutTrigger}
                className="p-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 text-slate-400 transition-colors shrink-0 shadow-xs cursor-pointer"
                title="Sign Out Google Account"
              >
                <X className="w-4 h-4" />
              </button>
            ) : (
              <button 
                onClick={handleGoogleSignInTrigger}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-md text-xs font-extrabold rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
                title="Google login persistent workspace"
              >
                Login
              </button>
            )}
          </div>

        </div>
      </header>

      {/* COMPONENT BODY WORKSPACE CONTENT */}
      <main className="max-w-4xl mx-auto px-4 mt-6 space-y-6">

        {/* NOTIFICATIONS CONTAINER */}
        <AnimatePresence mode="popLayout">
          {errorMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="p-4 text-xs bg-red-50 border border-red-150 text-red-850 rounded-2xl flex items-start gap-2 shadow-sm font-medium"
            >
              <span>{errorMsg}</span>
            </motion.div>
          )}

          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="p-4 text-xs bg-emerald-50 border border-emerald-150 text-emerald-850 rounded-2xl flex items-start gap-2.5 shadow-sm font-medium"
            >
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMsg}</span>
            </motion.div>
          )}

          {/* SIMULATED ACCOUNT GENERATION INBOX WARNING BANNER */}
          {simulatedInboxUser && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-5 bg-gradient-to-r from-indigo-900 to-slate-900 text-white rounded-3xl border border-indigo-800 shadow-xl flex flex-col gap-3"
            >
              <div className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-indigo-400" />
                <span className="text-xs uppercase tracking-widest font-mono font-black text-indigo-300">Sandbox Dev Mailbox (Interactive)</span>
              </div>
              <div>
                <p className="text-xs text-indigo-100">
                  You are checking the inbox for: <strong className="text-white brightness-125 font-bold underline">{simulatedInboxUser}</strong>.
                  Accept the invitation to trigger Google login for this mockup member and autojoin!
                </p>
              </div>
              <form onSubmit={handleCreateMockAccount} className="flex gap-2">
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow cursor-pointer flex items-center gap-1"
                >
                  <UserCheck className="w-3.5 h-3.5" /> Accept & Sim Login
                </button>
                <button 
                  type="button" 
                  onClick={() => setSimulatedInboxUser(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Close Sandbox Email
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ACTIVE GROUP BANNER AND ACTIVE MEMBER BADGES */}
        <section className="bg-white border border-slate-200 rounded-3xl p-5 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            
            {/* Left section: Group header */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-slate-400">Current Group Session</span>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl font-display font-bold text-slate-900">
                  {activeGroupData ? activeGroupData.name : "homies"}
                </h2>
                <div className="inline-flex items-center gap-1 bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[10px] px-2 py-0.5 rounded-full font-bold">
                  👥 {activeParticipantsNames.length} members
                </div>
              </div>
            </div>

            {/* Right section: ADD MEMBER BUTTON */}
            <button 
              onClick={() => setShowAddMemberModal(true)}
              className="inline-flex items-center justify-center gap-1.5 py-2 px-4 bg-slate-900 hover:bg-slate-805 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              id="add-member-trigger"
            >
              <Plus className="w-4 h-4" /> Add Person
            </button>
          </div>

          {/* Members bubble map */}
          <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100">
            {currentParticipantsList.map((m: any, idx: number) => (
              <div 
                key={idx}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-full font-semibold text-xs text-slate-700"
              >
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
                <span>{m.name}</span>
                {m.email && (
                  <span className="text-[9px] text-slate-400 font-normal">({m.email})</span>
                )}
                {m.uid ? (
                  <span className="bg-emerald-50 border border-emerald-150 text-[8px] text-emerald-600 uppercase font-mono font-black scale-95 rounded-md px-1 py-0.5">Linked</span>
                ) : (
                  m.email && <span className="bg-amber-50 border border-amber-150 text-[8px] text-amber-600 uppercase font-mono font-black scale-95 rounded-md px-1 py-0.5">Invited</span>
                )}
              </div>
            ))}

            {currentParticipantsList.length === 0 && (
              <p className="text-xs text-slate-400">No participants inside this group. Click "Add Person" above to register splitters.</p>
            )}
          </div>
        </section>

        {/* ACTIVE WORKSPACE STACK - MOBILE FIRST PURE VERTICAL FLOW */}
        <div className="flex flex-col gap-6">

          {/* LEFT: THE ACTIVE EXPENSE LOG CARD */}
          <section className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm flex flex-col justify-between">
            <div>
              <div className="bg-slate-50/70 border-b border-slate-150 p-4.5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ReceiptText className="w-4 h-4 text-indigo-505" />
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-500">Active Ledger Log</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 font-mono text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md shadow-xs shrink-0">
                    {activeLedgerData ? activeLedgerData.name : "Active Session"}
                  </span>
                </div>
              </div>

              {/* Expenses detail list */}
              <div className="p-4 max-h-[350px] overflow-y-auto divide-y divide-slate-100">
                {activeExpenses.map((exp, index) => (
                  <div key={index} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div>
                      <h4 className="font-bold text-slate-800">{exp.name}</h4>
                      <p className="text-xs text-slate-400 truncate max-w-[200px]">{exp.description}</p>
                    </div>
                    <div className="font-mono font-bold text-slate-700">
                      ${exp.amount.toFixed(2)}
                    </div>
                  </div>
                ))}

                {activeExpenses.length === 0 && (
                  <div className="text-center py-16 px-4 text-slate-400 space-y-2">
                    <ReceiptText className="w-7 h-7 mx-auto text-slate-300" />
                    <p className="text-xs font-medium">This ledger session is clean.</p>
                    <p className="text-[10px] text-slate-400 font-normal">Trigger the microphone at the bottom to declare transactions organically!</p>
                  </div>
                )}
              </div>
            </div>

            {/* Manual insertion form */}
            <div className="p-4 bg-slate-50/50 border-t border-slate-155">
              <form onSubmit={handleManualInputSubmit} className="flex gap-2">
                <input 
                  type="text" 
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="Or type payment (e.g. Kaushik paid 15)..." 
                  className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:border-indigo-500 transition-all shadow-xs"
                />
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-805 text-white font-bold text-xs rounded-xl shadow-xs shrink-0 cursor-pointer"
                >
                  Add
                </button>
              </form>
            </div>
          </section>

          {/* RIGHT: THE SETTLEMENTS CALCULATOR */}
          <section className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm flex flex-col justify-between">
            <div>
              <div className="bg-slate-50/70 border-b border-slate-150 p-4.5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-indigo-505" />
                  <span className="text-xs uppercase tracking-widest font-bold text-slate-500">Settlements Calculator</span>
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                    <span className="text-[8px] uppercase tracking-widest font-mono font-bold text-slate-400 block mb-0.5">Session Total</span>
                    <span className="text-base font-mono font-extrabold text-slate-850">${activeTotalPool.toFixed(2)}</span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3">
                    <span className="text-[8px] uppercase tracking-widest font-mono font-bold text-slate-400 block mb-0.5">Fair Share</span>
                    <span className="text-base font-mono font-extrabold text-slate-850">${activeFairShare.toFixed(2)}</span>
                  </div>
                </div>

                {/* Settlements list */}
                <div className="border-t border-slate-100 pt-3">
                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Who owes who:</span>
                  
                  {activeSettlements.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-450 font-medium">
                      Everyone is perfectly settled up!
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {activeSettlements.map((debt, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs p-2 bg-rose-50/40 border border-rose-100 rounded-xl">
                          <span className="font-bold text-slate-700">{debt.from}</span>
                          <span className="flex items-center gap-1 font-mono font-bold text-rose-700 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full text-[10px]">
                            ${debt.amount.toFixed(2)} <ArrowRight className="w-3 h-3 text-rose-455 shrink-0" />
                          </span>
                          <span className="font-bold text-slate-700">{debt.to}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Spent by member breakdown summary */}
                <div className="border-t border-slate-100 pt-3">
                  <span className="font-bold text-[10px] text-slate-400 uppercase tracking-widest mb-2 block">Total Spent per Person:</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-32 overflow-y-auto">
                    {Object.entries(activeSpendMap).map(([name, val]) => (
                      <div key={name} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-150 rounded-xl text-xs">
                        <span className="font-bold text-slate-650 truncate max-w-[120px]">👤 {name}</span>
                        <span className="font-mono font-bold text-slate-700">${val.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Archive and Clear Actions for active session */}
            <div className="p-3.5 bg-slate-50/50 border-t border-slate-150 space-y-2">
              <button 
                onClick={() => {
                  if (activeExpenses.length === 0) {
                    setErrorMsg("Workspace is currently empty. Cannot archive empty session.");
                  } else {
                    setArchiveTitle(`Split Session on ${new Date().toLocaleDateString()}`);
                    setShowArchiveModal(true);
                  }
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-550 font-bold text-xs text-white rounded-xl transition-all cursor-pointer shadow-sm active:scale-98"
                type="button"
              >
                <FolderOpen className="w-4 h-4 text-white shrink-0" />
                <span>Archive Session to History</span>
              </button>

              {showResetConfirm ? (
                <div className="p-1.5 bg-rose-50 border border-rose-154 rounded-2xl flex flex-col gap-1.5 text-center animate-fade-in">
                  <p className="text-[10px] font-bold text-rose-800 uppercase tracking-wider">Are you sure you want to delete all entries?</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleClearActiveLedger}
                      className="flex-1 py-1.5 px-3 bg-rose-600 hover:bg-rose-750 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                    <button 
                      onClick={() => setShowResetConfirm(false)}
                      className="flex-1 py-1.5 px-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => setShowResetConfirm(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-4 bg-slate-100 hover:bg-slate-200 border border-slate-200 font-bold text-xs text-slate-600 rounded-xl transition-all cursor-pointer shadow-xs active:scale-98"
                >
                  <Trash2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Clear Current Session</span>
                </button>
              )}
            </div>
          </section>

          {/* LEDGER HISTORY SHEET CONTAINER (Sits vertically below balances) */}
          <section className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm p-5 space-y-4">
            <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-505" />
                <span className="text-xs uppercase tracking-widest font-black text-slate-500">Ledger History ({allGroupLedgers.length})</span>
              </div>
            </div>

            <div className="space-y-4 max-h-[500px] overflow-y-auto">
              {allGroupLedgers.map((led) => {
                const sheetTotal = led.totalAmount || 0;
                const dateString = led.createdAt ? new Date(led.createdAt.seconds * 1000).toLocaleDateString() : new Date().toLocaleDateString();
                const expensesList = led.expenses || [];

                return (
                  <div 
                    key={led.id} 
                    className="bg-slate-50/60 border border-slate-150 rounded-2xl p-4 space-y-3 transition-all hover:bg-slate-50"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">
                          📁 {led.name}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Archived on {dateString}
                        </span>
                      </div>
                      <span className="font-mono font-extrabold text-xs text-indigo-705 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-lg shrink-0">
                        Total: ${sheetTotal.toFixed(2)}
                      </span>
                    </div>

                    {/* Expenses sub-list */}
                    {expensesList.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[9px] uppercase font-bold text-slate-400 block tracking-widest">Logged Payments:</span>
                        <div className="space-y-1 divide-y divide-slate-100 bg-white/70 border border-slate-200 p-2 rounded-xl max-h-32 overflow-y-auto">
                          {expensesList.map((e: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-xs py-1">
                              <div>
                                <span className="font-bold text-slate-700">{e.name}</span>
                                <span className="text-slate-450 text-[10px] ml-1.5">({e.description})</span>
                              </div>
                              <span className="font-mono font-semibold text-slate-655">${e.amount.toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {allGroupLedgers.length === 0 && (
                <div className="text-center py-12 text-slate-400 space-y-2 bg-slate-50/45 border border-dashed border-slate-200 rounded-2xl p-4">
                  <FolderOpen className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold">No historical ledger sheets.</p>
                  <p className="text-[10px] text-slate-400">Click "Archive Session to History" when finished split logging!</p>
                </div>
              )}
            </div>
          </section>

        </div>

      </main>

      {/* PERSISTENT FLOATING MICROPHONE - BUTTON ON THE BOTTOM MIDDLE */}
      <footer className="fixed bottom-0 left-0 right-0 py-6 bg-gradient-to-t from-slate-50 via-slate-50/95 to-transparent flex justify-center items-center pointer-events-none z-30">
        <div className="pointer-events-auto flex flex-col items-center gap-1.5 relative">
          
          {/* Continuous Listener pulsing helper */}
          <AnimatePresence>
            {isListening && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute -top-10 bg-rose-600 border border-rose-500 text-white font-mono text-[9px] font-black uppercase tracking-widest py-1 px-3.5 rounded-full shadow-lg"
              >
                🔴 Listening... Press Mic again to finish speaking
              </motion.div>
            )}
            
            {isProcessing && !isListening && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute -top-10 bg-slate-900 text-white font-mono text-[9px] font-black uppercase tracking-widest py-1 px-3.5 rounded-full shadow-lg flex items-center gap-1"
              >
                <Loader2 className="w-3 h-3 animate-spin" /> Analyze with Gemini...
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative flex items-center justify-center">
            <div className="absolute w-[76px] h-[76px] border-2 border-indigo-600 rounded-full opacity-10 animate-pulse" />
            
            <AnimatePresence>
              {isListening && (
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1.35, opacity: 0.35 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.3, ease: "easeOut" }}
                  className="absolute inset-0 bg-rose-500 rounded-full"
                />
              )}
            </AnimatePresence>

            <button
              id="microphone-input"
              onClick={toggleListening}
              className={`w-[72px] h-[72px] rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 cursor-pointer border-none outline-none relative z-10 ${
                isListening 
                  ? "bg-rose-600 hover:bg-rose-700 text-white" 
                  : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/10"
              }`}
              title="Continuous Speech Input Widget. Click and describe group splits."
            >
              {isListening ? (
                <MicOff className="w-6 h-6 stroke-[2]" />
              ) : (
                <Mic className="w-6 h-6 stroke-[2]" />
              )}
            </button>
          </div>
        </div>
      </footer>

      {/* POPUP MODAL: ADD GROUP */}
      <AnimatePresence>
        {showNewGroupModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-55">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[26px] border border-slate-200 shadow-2xl p-6 w-full max-w-sm text-left relative"
            >
              <button 
                onClick={() => setShowNewGroupModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-display font-bold text-lg text-slate-900 mb-1">Create New Split Group</h3>
              <p className="text-xs text-slate-400 mb-4">Expenses and calculations will be confined within this group partition.</p>

              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Group Name</label>
                  <input 
                    type="text"
                    required
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="e.g. Europe Trip, RoamMates"
                    className="w-full text-xs font-semibold border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-505 bg-slate-50 focus:bg-white transition-all shadow-xs"
                    autoFocus
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-505 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Create Group
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POPUP MODAL: ADD MEMBER */}
      <AnimatePresence>
        {showAddMemberModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-55">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[26px] border border-slate-200 shadow-2xl p-6 w-full max-w-md text-left relative"
            >
              <button 
                onClick={() => setShowAddMemberModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-display font-bold text-lg text-slate-900 mb-1">Add Participant</h3>
              <p className="text-xs text-slate-400 mb-4">Enter name (required) and optional email to query registered users or dispatch invitation.</p>

              <form onSubmit={handleAddMemberSubmit} className="space-y-4">
                {modalError && (
                  <div className="p-3 bg-rose-50 border border-rose-150 rounded-xl text-xs font-semibold text-rose-750 animate-fade-in">
                    ⚠️ {modalError}
                  </div>
                )}
                {modalSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-150 rounded-xl text-xs font-semibold text-emerald-750 animate-fade-in">
                    ✨ {modalSuccess}
                  </div>
                )}
                
                {/* 1. NAME FIELD */}
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Spender Name</label>
                  <input 
                    type="text"
                    required
                    value={newMemberName}
                    onChange={(e) => setNewMemberName(e.target.value)}
                    placeholder="Svetlana"
                    className="w-full text-xs font-semibold border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-505 bg-slate-50 focus:bg-white transition-all shadow-xs"
                    autoFocus
                  />
                </div>

                {/* 2. EMAIL FIELD WITH INTEGRATED TYPE-AHEAD SEARCH SUGGESTIONS */}
                <div className="space-y-1 relative">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Email (Optional)</label>
                  <div className="relative">
                    <input 
                      type="email"
                      value={newMemberEmail}
                      onChange={(e) => handleEmailInputChange(e.target.value)}
                      placeholder="svetlana@example.com"
                      className="w-full text-xs font-semibold border border-slate-200 rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:border-indigo-505 bg-slate-50 focus:bg-white transition-all shadow-xs"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  </div>

                  {/* Suggestion autocomplete list drop block */}
                  {filteredSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1.5 rounded-xl bg-white border border-slate-200 shadow-xl overflow-hidden z-35 max-h-40 overflow-y-auto divide-y divide-slate-100">
                      {filteredSuggestions.map((user, idx) => (
                        <div 
                          key={idx}
                          onClick={() => handleSelectSuggestion(user)}
                          className="p-2.5 text-xs text-slate-700 hover:bg-slate-50 cursor-pointer flex justify-between items-center"
                        >
                          <div>
                            <span className="font-bold block">{user.displayName}</span>
                            <span className="text-[10px] text-slate-405">{user.email}</span>
                          </div>
                          <span className="bg-emerald-50 text-[9px] text-emerald-600 font-bold px-1.5 py-0.5 rounded border border-emerald-100">Found</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* EMAIL NOT REGISTERED DETECTED NOTICE BUTTON OR MOCK ACTIONS DESCRIPTION */}
                {newMemberEmail.trim().length > 0 && filteredSuggestions.length === 0 && !registeredUsers.some(u => u.email?.toLowerCase() === newMemberEmail.trim().toLowerCase()) && (
                  <div className="p-3 bg-amber-50 border border-amber-150 rounded-xl flex flex-col gap-1 text-[11px] text-amber-800">
                    <p className="font-bold flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-amber-600" /> Member not registered on Google
                    </p>
                    <p className="text-[10px] leading-relaxed text-amber-700">
                      This will register them as active, save metadata in group, and send a sandbox email invitation.
                    </p>
                  </div>
                )}

                <button 
                  type="submit"
                  className="w-full py-3 bg-slate-900 hover:bg-slate-805 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Confirm Participant
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* POPUP MODAL: ARCHIVE SESSION */}
      <AnimatePresence>
        {showArchiveModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-55">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[26px] border border-slate-200 shadow-2xl p-6 w-full max-w-sm text-left relative"
            >
              <button 
                onClick={() => setShowArchiveModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <h3 className="font-display font-bold text-lg text-slate-900 mb-1">Archive Active Ledger</h3>
              <p className="text-xs text-slate-400 mb-4">Freeze this session summary and store it under complete historical sheets.</p>

              <form onSubmit={handleArchiveActiveLedger} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Historical Name / Title</label>
                  <input 
                    type="text"
                    required
                    value={archiveTitle}
                    onChange={(e) => setArchiveTitle(e.target.value)}
                    placeholder="e.g. Europe Trip Day 1, Weekend Brunch"
                    className="w-full text-xs font-semibold border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-505 bg-slate-50 focus:bg-white transition-all shadow-xs"
                    autoFocus
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-550 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer"
                >
                  Confirm and Archive
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BOTTOM FIXED INTERACTIVE DEEP SANDBOX SIMULATION SYSTEM PANEL */}
      {currentUser && pendingInvites.length > 0 && (
        <section className="bg-white border-t border-slate-200 fixed bottom-24 right-4 max-w-xs p-4 rounded-2xl shadow-2xl z-40 hidden md:block">
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
            <span className="font-display font-black text-[10px] tracking-wider text-rose-600 uppercase flex items-center gap-1">
              📬 SandBox Email Outbox
            </span>
          </div>

          <div className="space-y-2 max-h-36 overflow-y-auto">
            {pendingInvites.map((inv, idx) => (
              <div key={idx} className="p-2 bg-slate-50 border border-slate-155 rounded-xl text-[10px] space-y-1">
                <div>
                  <span className="font-bold block text-slate-700">To: {inv.email}</span>
                  <span className="text-slate-400">Join: "{inv.groupName}"</span>
                </div>
                <button 
                  onClick={() => handleSimulateLogin(inv.email, inv.nameInGroup)}
                  className="w-full py-1 text-center bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg border border-indigo-200/50 transition-colors cursor-pointer text-[9px] uppercase"
                >
                  Open Sandbox Inbox
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
