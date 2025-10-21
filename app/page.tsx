import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>ChatApp</h1>
        <p className={styles.description}>
          Chat with your business documents using AI
        </p>
        <div className={styles.buttons}>
          <Link href="/auth/login" className={styles.buttonPrimary}>
            Admin Login
          </Link>
          <Link href="/chat" className={styles.buttonSecondary}>
            Customer Chat
          </Link>
        </div>
      </div>
    </div>
  );
}
