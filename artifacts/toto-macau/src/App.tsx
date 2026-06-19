import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Shell } from "@/components/layout/Shell";
import Dashboard from "@/pages/Dashboard";
import DataBrowser from "@/pages/DataBrowser";
import Statistics from "@/pages/Statistics";
import Analytics from "@/pages/Analytics";
import Prediction from "@/pages/Prediction";
import PredictionV3 from "@/pages/PredictionV3";
import PredictionV4 from "@/pages/PredictionV4";
import PredictionHistory from "@/pages/PredictionHistory";
import TodayPrediction from "@/pages/TodayPrediction";
import PredictionV5 from "@/pages/PredictionV5";
import PredictionV6 from "@/pages/PredictionV6";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
    },
  },
});

function Router() {
  return (
    <Shell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/data/:year" component={DataBrowser} />
        <Route path="/statistik" component={Statistics} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/prediksi" component={Prediction} />
        <Route path="/prediksi-v3" component={PredictionV3} />
        <Route path="/prediksi-v4" component={PredictionV4} />
        <Route path="/riwayat-v4" component={PredictionHistory} />
        <Route path="/prediksi-hari-ini" component={TodayPrediction} />
        <Route path="/prediksi-v5" component={PredictionV5} />
        <Route path="/prediksi-v6" component={PredictionV6} />
        <Route component={NotFound} />
      </Switch>
    </Shell>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
