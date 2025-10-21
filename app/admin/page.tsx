"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./page.module.css";

interface Document {
  id: string;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    checkAuth();
    fetchDocuments();
  }, []);

  const checkAuth = async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/auth/login");
      return;
    }

    setUser(user);
    setLoading(false);
  };

  const fetchDocuments = async () => {
    try {
      const response = await fetch("/api/documents");
      const data = await response.json();

      if (response.ok) {
        setDocuments(data.documents || []);
      }
    } catch (err) {
      console.error("Error fetching documents:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Upload failed");
        setUploading(false);
        return;
      }

      await fetchDocuments();
      setUploading(false);

      // Reset file input
      e.target.value = "";
    } catch (err) {
      setError("An error occurred during upload");
      setUploading(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const response = await fetch(`/api/documents/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await fetchDocuments();
      }
    } catch (err) {
      console.error("Error deleting document:", err);
    }
  };

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.loadingText}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <nav className={styles.nav}>
        <div className={styles.navContent}>
          <h1 className={styles.navTitle}>Admin Console</h1>
          <div className={styles.navActions}>
            <button
              onClick={() => router.push("/admin/analytics")}
              className={styles.analyticsButton}
            >
              Analytics
            </button>
            <button onClick={handleLogout} className={styles.logoutButton}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className={styles.main}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Upload Documents</h2>
          <p className={styles.cardDescription}>
            Upload PDF, TXT, DOC, or DOCX files. Files will be processed and
            made available for customer chat.
          </p>

          {error && <div className={styles.error}>{error}</div>}

          <label>
            <span className="sr-only">Choose file</span>
            <input
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={handleFileUpload}
              disabled={uploading}
              className={styles.fileInput}
            />
          </label>

          {uploading && (
            <p className={styles.uploadingText}>
              Uploading and processing document...
            </p>
          )}
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            Your Documents ({documents.length})
          </h2>

          {documents.length === 0 ? (
            <p className={styles.emptyState}>
              No documents uploaded yet. Upload your first document above!
            </p>
          ) : (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>Uploaded</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className={styles.tableCellPrimary}>
                        {doc.original_name}
                      </td>
                      <td className={styles.tableCellSecondary}>
                        {doc.file_type.split("/")[1]?.toUpperCase()}
                      </td>
                      <td className={styles.tableCellSecondary}>
                        {formatFileSize(doc.file_size)}
                      </td>
                      <td className={styles.tableCellSecondary}>
                        {new Date(doc.uploaded_at).toLocaleDateString()}
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteDocument(doc.id)}
                          className={styles.deleteButton}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className={styles.infoCard}>
          <h3 className={styles.infoTitle}>Customer Chat Link</h3>
          <p className={styles.infoText}>
            Share this link with your customers to let them chat with your
            documents:
          </p>
          <div className={styles.infoCodeBlock}>
            <code className={styles.infoCode}>
              {typeof window !== "undefined" &&
                `${window.location.origin}/chat/${user?.id}`}
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}
