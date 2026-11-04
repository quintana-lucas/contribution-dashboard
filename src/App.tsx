import styles from './App.module.css'
import Footer from './components/Footer'
import Header from './components/Header'
import WidgetGrid from './components/WidgetGrid'

function App() {
  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        <p className={styles.intro}>
          Widgets for GitHub team collaboration will appear here.
        </p>
        <WidgetGrid />
      </main>
      <Footer />
    </div>
  )
}

export default App
