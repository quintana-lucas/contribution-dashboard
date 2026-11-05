import styles from './App.module.css'
import Footer from './components/Footer'
import Header from './components/Header'
import Tabs from './components/Tabs'
import TeamPlaceholder from './components/TeamPlaceholder'
import WidgetGrid from './components/WidgetGrid'

function App() {
  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        <Tabs
          label="Dashboard views"
          tabs={[
            {
              key: 'overview',
              label: 'Overview',
              content: (
                <>
                  <p className={styles.intro}>
                    Widgets for GitHub team collaboration will appear here.
                  </p>
                  <WidgetGrid />
                </>
              ),
            },
            { key: 'team', label: 'Team', content: <TeamPlaceholder /> },
          ]}
        />
      </main>
      <Footer />
    </div>
  )
}

export default App
