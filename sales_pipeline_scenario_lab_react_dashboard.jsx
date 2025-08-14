import React, { useMemo, useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { Download, RefreshCw } from "lucide-react";

// ========================
// Formatters
// ========================
const phpM = (n, dp = 2) => `₱${(n / 1_000_000).toFixed(dp)}M`;
const volH = (n, dp = 2) => `${(n / 100).toFixed(dp)}H`;
const int = (n) => new Intl.NumberFormat("en-US").format(Math.round(n));

// ========================
// RNG + Synthetic dataset
// ========================
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateSample(seed = 42, year = 2025) {
  const rnd = mulberry32(seed);
  const industries = ["Retail", "FMCG", "Technology", "Manufacturing", "Healthcare", "Logistics"];
  const areas = ["NCR", "North Luzon", "South Luzon", "Visayas", "Mindanao"];
  const agents = ["Alonzo", "Bautista", "Cruz", "Dela Cruz", "Escobar", "Flores", "Garcia", "Hernandez"];
  const statuses = ["Prospect", "Negotiation", "Won", "Lost", "On Hold"];

  const accounts = Array.from({ length: 80 }).map((_, idx) => {
    const industry = industries[Math.floor(rnd() * industries.length)];
    const area = areas[Math.floor(rnd() * areas.length)];
    const agent = agents[Math.floor(rnd() * agents.length)];
    const status = statuses[Math.floor(rnd() * statuses.length)];
    const name = `${industry.substring(0, 3).toUpperCase()}-${area.substring(0, 2).toUpperCase()}-ACCT-${String(idx + 1).padStart(3, "0")}`;
    const industryW = 0.8 + industries.indexOf(industry) * 0.08;
    const areaW = 0.9 + areas.indexOf(area) * 0.05;
    const baseRev = 400000 + rnd() * 3000000 * industryW * areaW; // monthly potential
    const baseVol = 40 + Math.floor(rnd() * 600 * industryW * areaW);
    return { id: idx + 1, name, industry, area, agent, status, baseRev, baseVol };
  });

  const weekly = [];
  for (let w = 1; w <= 52; w++) {
    accounts.forEach((acc, i) => {
      const season = 1 + 0.12 * Math.sin((2 * Math.PI * (w + i)) / 52);
      const rev = (acc.baseRev / 4.345) * (0.6 + rnd() * 0.8) * season * (year === 2025 ? 1.06 : 1.0);
      const vol = (acc.baseVol / 4.345) * (0.6 + rnd() * 0.8) * season;
      weekly.push({ week: w, year, account: acc.name, industry: acc.industry, area: acc.area, agent: acc.agent, status: acc.status, revenue: rev, volume: vol });
    });
  }

  return { weekly, accounts, meta: { industries, areas, agents, statuses, year } };
}

// ========================
// Aggregations
// ========================
function weeklyToMonth(week) { return Math.min(12, Math.max(1, Math.ceil(week / 4.345))); }

function aggregate(data, period = "Weekly") {
  if (period === "Weekly") {
    const by = {};
    for (const d of data) {
      const k = d.week;
      if (!by[k]) by[k] = { week: k, revenue: 0, volume: 0 };
      by[k].revenue += d.revenue;
      by[k].volume += d.volume;
    }
    return Object.values(by).sort((a, b) => a.week - b.week);
  }
  if (period === "Monthly") {
    const by = {};
    for (const d of data) {
      const k = weeklyToMonth(d.week);
      if (!by[k]) by[k] = { month: k, revenue: 0, volume: 0 };
      by[k].revenue += d.revenue;
      by[k].volume += d.volume;
    }
    return Object.values(by).sort((a, b) => a.month - b.month);
  }
  const totals = data.reduce((acc, d) => ({ revenue: acc.revenue + d.revenue, volume: acc.volume + d.volume }), { revenue: 0, volume: 0 });
  return [{ year: data[0]?.year ?? "N/A", revenue: totals.revenue, volume: totals.volume }];
}

function groupByKey(data, key) {
  const map = new Map();
  data.forEach((d) => {
    const k = d[key];
    if (!map.has(k)) map.set(k, { [key]: k, revenue: 0, volume: 0 });
    const v = map.get(k);
    v.revenue += d.revenue;
    v.volume += d.volume;
  });
  return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
}
const groupByAccount = (d) => groupByKey(d, "account");
const groupByIndustry = (d) => groupByKey(d, "industry");
const groupByArea = (d) => groupByKey(d, "area");
const groupByAgent = (d) => groupByKey(d, "agent");

function statusByAgent(data) {
  const map = {};
  data.forEach((d) => {
    const a = d.agent;
    const s = d.status;
    if (!map[a]) map[a] = { agent: a };
    map[a][s] = (map[a][s] || 0) + d.revenue; // weight by revenue
  });
  return Object.values(map);
}

// ========================
// Scenario engine
// ========================
function applyScenario(data, opts) {
  const { revenueMultiplier, volumeMultiplier, mixShiftIndustry, mixShiftPct } = opts;
  return data.map((d) => {
    let rev = d.revenue * revenueMultiplier;
    let vol = d.volume * volumeMultiplier;
    if (mixShiftIndustry && d.industry === mixShiftIndustry) {
      rev *= 1 + mixShiftPct / 100;
      vol *= 1 + (mixShiftPct * 0.6) / 100; // partial correlation
    }
    return { ...d, revenue: rev, volume: vol };
  });
}

// ========================
// UI helpers
// ========================
const KPICard = ({ title, value, subtitle }) => (
  <Card className="rounded-2xl shadow-md">
    <CardContent className="p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
    </CardContent>
  </Card>
);

const Section = ({ title, children }) => (
  <div className="space-y-3">
    <h2 className="text-lg font-semibold">{title}</h2>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">{children}</div>
  </div>
);

// ========================
// Main App
// ========================
export default function App() {
  const thisYear = 2025;
  const lastYear = 2024;

  // Core levers
  const [seed, setSeed] = useState(42);
  const [period, setPeriod] = useState("Monthly");
  const [revenueMultiplier, setRevenueMultiplier] = useState(1.0);
  const [volumeMultiplier, setVolumeMultiplier] = useState(1.0);
  const [mixShiftIndustry, setMixShiftIndustry] = useState(null); // use null for none
  const [mixShiftPct, setMixShiftPct] = useState(10);
  const [showGrid, setShowGrid] = useState(true);

  // Comparison levers
  const [monthCutoff, setMonthCutoff] = useState(new Date().getMonth() + 1); // 1..12
  const [forecastAdjPct, setForecastAdjPct] = useState(0);

  // Base datasets
  const baseTY = useMemo(() => generateSample(seed, thisYear), [seed]);
  const baseLY = useMemo(() => generateSample(seed ^ 1337, lastYear), [seed]);
  const industries = baseTY.meta.industries;

  // Apply scenario to TY
  const adjustedTY = useMemo(
    () => applyScenario(baseTY.weekly, { revenueMultiplier, volumeMultiplier, mixShiftIndustry, mixShiftPct }),
    [baseTY, revenueMultiplier, volumeMultiplier, mixShiftIndustry, mixShiftPct]
  );

  // Aggregations for dashboards
  const seriesTY = useMemo(() => aggregate(adjustedTY, period), [adjustedTY, period]);
  const seriesLY = useMemo(() => aggregate(baseLY.weekly, period), [baseLY, period]);

  const perIndustry = useMemo(() => groupByIndustry(adjustedTY), [adjustedTY]);
  const perArea = useMemo(() => groupByArea(adjustedTY), [adjustedTY]);
  const perAccount = useMemo(() => groupByAccount(adjustedTY), [adjustedTY]);
  const perAgent = useMemo(() => groupByAgent(adjustedTY), [adjustedTY]);
  const statusAgent = useMemo(() => statusByAgent(adjustedTY), [adjustedTY]);

  // Monthly for YTD/MTD/Forecast comparisons
  const monthlyTY = useMemo(() => aggregate(adjustedTY, "Monthly"), [adjustedTY]);
  const monthlyLY = useMemo(() => aggregate(baseLY.weekly, "Monthly"), [baseLY]);

  // YTD / MTD
  const ytdRevenueTY = monthlyTY.filter((m) => m.month <= monthCutoff).reduce((s, d) => s + d.revenue, 0);
  const ytdVolumeTY = monthlyTY.filter((m) => m.month <= monthCutoff).reduce((s, d) => s + d.volume, 0);
  const ytdRevenueLY = monthlyLY.filter((m) => m.month <= monthCutoff).reduce((s, d) => s + d.revenue, 0);
  const ytdVolumeLY = monthlyLY.filter((m) => m.month <= monthCutoff).reduce((s, d) => s + d.volume, 0);

  const mtdRevenueTY = monthlyTY.find((m) => m.month === monthCutoff)?.revenue ?? 0;
  const mtdVolumeTY = monthlyTY.find((m) => m.month === monthCutoff)?.volume ?? 0;
  const mtdRevenueLY = monthlyLY.find((m) => m.month === monthCutoff)?.revenue ?? 0;
  const mtdVolumeLY = monthlyLY.find((m) => m.month === monthCutoff)?.volume ?? 0;

  // Forecast = YTD + avg(months so far) * remaining months * (1 + Adj%)
  const avgPerMonthRevTY = monthCutoff > 0 ? ytdRevenueTY / monthCutoff : 0;
  const forecastRevenueTY = ytdRevenueTY + (12 - monthCutoff) * avgPerMonthRevTY * (1 + forecastAdjPct / 100);
  const avgPerMonthVolTY = monthCutoff > 0 ? ytdVolumeTY / monthCutoff : 0;
  const forecastVolumeTY = ytdVolumeTY + (12 - monthCutoff) * avgPerMonthVolTY * (1 + forecastAdjPct / 100);

  // KPI
  const overallRevenue = seriesTY.reduce((s, d) => s + (d.revenue || 0), 0);
  const overallVolume = seriesTY.reduce((s, d) => s + (d.volume || 0), 0);

  const avgMonthly = useMemo(() => aggregate(adjustedTY, "Monthly"), [adjustedTY]);
  const avgMonthlyRevenue = avgMonthly.length ? avgMonthly.reduce((s, d) => s + d.revenue, 0) / avgMonthly.length : 0;
  const avgMonthlyVolume = avgMonthly.length ? avgMonthly.reduce((s, d) => s + d.volume, 0) / avgMonthly.length : 0;

  const top10Rev = perAccount.slice(0, 10);
  const top10Vol = [...perAccount].sort((a, b) => b.volume - a.volume).slice(0, 10);

  const exportCSV = () => {
    const rows = [["week", "year", "account", "industry", "area", "agent", "status", "revenue", "volume"], ...adjustedTY.map((d) => [d.week, d.year, d.account, d.industry, d.area, d.agent, d.status, Math.round(d.revenue), Math.round(d.volume)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pipeline_scenario_data.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // ========================
  // Runtime tests
  // ========================
  useEffect(() => {
    const approx = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
    // Test: monthly arrays exist and length=12
    console.assert(Array.isArray(monthlyTY) && monthlyTY.length === 12, "TEST: monthlyTY has 12 buckets");
    console.assert(Array.isArray(monthlyLY) && monthlyLY.length === 12, "TEST: monthlyLY has 12 buckets");
    // Test: volume normalization helper
    console.assert(volH(1000) === "10.00H", "TEST: volH scales to hundreds");
    // Test: forecast formula example
    const ytd = 1200, m = 6, adj = 10; const avg = ytd / m; const fc = ytd + (12 - m) * avg * (1 + adj / 100);
    console.assert(approx(fc, 1200 + 6 * 200 * 1.1), "TEST: Forecast formula");
    // Test: Select sentinel behavior (logic only)
    const v = (mixShiftIndustry ?? "none") === "none" ? null : mixShiftIndustry;
    console.assert(v === null, "TEST: default mixShiftIndustry is null when 'none'");
  }, [monthlyTY, monthlyLY, mixShiftIndustry]);

  return (
    <div className="p-4 md:p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Sales Pipeline Scenario Lab</h1>
          <p className="text-sm text-gray-500">LY vs TY, YTD/MTD, and outlook. Revenue in Millions PHP, Volume normalized to hundreds.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">Grid</Label>
            <Switch checked={showGrid} onCheckedChange={setShowGrid} />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setRevenueMultiplier(1);
              setVolumeMultiplier(1);
              setMixShiftIndustry(null);
              setMixShiftPct(10);
              setMonthCutoff(new Date().getMonth() + 1);
              setForecastAdjPct(0);
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />Reset
          </Button>
          <Button onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
        </div>
      </motion.div>

      {/* Controls */}
      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div>
              <Label className="text-xs">Period</Label>
              <Tabs value={period} onValueChange={setPeriod} className="mt-2">
                <TabsList className="grid grid-cols-3">
                  <TabsTrigger value="Weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="Monthly">Monthly</TabsTrigger>
                  <TabsTrigger value="Yearly">Yearly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <Label className="text-xs">Revenue Multiplier: {revenueMultiplier.toFixed(2)}x</Label>
              <Slider className="mt-2" min={0.5} max={1.5} step={0.01} value={[revenueMultiplier]} onValueChange={([v]) => setRevenueMultiplier(v)} />
            </div>
            <div>
              <Label className="text-xs">Volume Multiplier: {volumeMultiplier.toFixed(2)}x</Label>
              <Slider className="mt-2" min={0.5} max={1.5} step={0.01} value={[volumeMultiplier]} onValueChange={([v]) => setVolumeMultiplier(v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Mix Shift Industry</Label>
                <Select value={mixShiftIndustry ?? "none"} onValueChange={(v) => setMixShiftIndustry(v === "none" ? null : v)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {industries.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Mix Shift Impact: {mixShiftPct}%</Label>
                <Slider className="mt-2" min={-50} max={50} step={1} value={[mixShiftPct]} onValueChange={([v]) => setMixShiftPct(v)} />
              </div>
            </div>
          </div>

          {/* Comparison Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
            <div>
              <Label className="text-xs">YTD/MTD Month Cutoff: M{monthCutoff}</Label>
              <Slider className="mt-2" min={1} max={12} step={1} value={[monthCutoff]} onValueChange={([v]) => setMonthCutoff(v)} />
            </div>
            <div>
              <Label className="text-xs">Forecast Adjustment: {forecastAdjPct}%</Label>
              <Slider className="mt-2" min={-50} max={50} step={1} value={[forecastAdjPct]} onValueChange={([v]) => setForecastAdjPct(v)} />
            </div>
            <div className="text-xs text-gray-500">
              YTD sums months ≤ cutoff. MTD is the cutoff month only. Forecast = YTD + avg(months so far) × remaining months × (1+Adj%).
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Overall Pipeline Revenue" value={phpM(overallRevenue, 1)} subtitle={period} />
        <KPICard title="Overall Pipeline Volume" value={volH(overallVolume, 1)} subtitle={period} />
        <KPICard title="Average Monthly Revenue" value={phpM(avgMonthlyRevenue, 1)} subtitle="Across 12 months" />
        <KPICard title="Average Monthly Volume" value={volH(avgMonthlyVolume, 1)} subtitle="Across 12 months" />
      </div>

      {/* Revenue Trajectory (Millions PHP) */}
      <Section title="Revenue Trajectory (Millions PHP)">
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={seriesTY}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                {period === "Weekly" && <XAxis dataKey="week" />}
                {period === "Monthly" && <XAxis dataKey="month" />}
                {period === "Yearly" && <XAxis dataKey="year" />}
                <YAxis tickFormatter={(v) => phpM(v, 1)} />
                <Tooltip formatter={(v) => phpM(v, 2)} />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="Revenue" fillOpacity={0.3} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Section>

      {/* Volume Trajectory (Hundreds) */}
      <Section title="Volume Trajectory (Hundreds)">
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={seriesTY}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                {period === "Weekly" && <XAxis dataKey="week" />}
                {period === "Monthly" && <XAxis dataKey="month" />}
                {period === "Yearly" && <XAxis dataKey="year" />}
                <YAxis tickFormatter={(v) => volH(v, 1)} />
                <Tooltip formatter={(v) => volH(v, 2)} />
                <Legend />
                <Area type="monotone" dataKey="volume" name="Volume" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Section>

      {/* Comparisons */}
      <Section title={`Revenue: ${lastYear} Actual vs ${thisYear} YTD vs ${thisYear} Forecast (Millions PHP)`}>
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[320px]">
            {(() => {
              const data = [
                { label: `${lastYear} Actual`, revenue: seriesLY[0]?.revenue ?? aggregate(baseLY.weekly, "Yearly")[0].revenue },
                { label: `${thisYear} YTD (M${monthCutoff})`, revenue: ytdRevenueTY },
                { label: `${thisYear} Forecast`, revenue: forecastRevenueTY },
              ];
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data}>
                    {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(v) => phpM(v, 1)} />
                    <Tooltip formatter={(v) => phpM(v, 2)} />
                    <Legend />
                    <Bar dataKey="revenue" name="Revenue" />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>
      </Section>

      <Section title={`Volume: ${lastYear} Actual vs ${thisYear} YTD vs ${thisYear} Forecast (Hundreds)`}>
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[320px]">
            {(() => {
              const data = [
                { label: `${lastYear} Actual`, volume: seriesLY[0]?.volume ?? aggregate(baseLY.weekly, "Yearly")[0].volume },
                { label: `${thisYear} YTD (M${monthCutoff})`, volume: ytdVolumeTY },
                { label: `${thisYear} Forecast`, volume: forecastVolumeTY },
              ];
              return (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data}>
                    {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                    <XAxis dataKey="label" />
                    <YAxis tickFormatter={(v) => volH(v, 1)} />
                    <Tooltip formatter={(v) => volH(v, 2)} />
                    <Legend />
                    <Bar dataKey="volume" name="Volume" />
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>
      </Section>

      {/* LY vs TY Monthly overlay (Revenue) */}
      <Section title={`Monthly Revenue Overlay: ${lastYear} vs ${thisYear} (Millions PHP)`}>
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                ly: monthlyLY[i]?.revenue || 0,
                ty: monthlyTY[i]?.revenue || 0,
              }))}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => phpM(v, 1)} />
                <Tooltip formatter={(v) => phpM(v, 2)} />
                <Legend />
                <Line type="monotone" dataKey="ly" name={`${lastYear} Revenue`} dot={false} />
                <Line type="monotone" dataKey="ty" name={`${thisYear} Revenue`} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Section>

      {/* LY vs TY Monthly overlay (Volume) */}
      <Section title={`Monthly Volume Overlay: ${lastYear} vs ${thisYear} (Hundreds)`}>
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={Array.from({ length: 12 }, (_, i) => ({
                month: i + 1,
                ly: monthlyLY[i]?.volume || 0,
                ty: monthlyTY[i]?.volume || 0,
              }))}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => volH(v, 1)} />
                <Tooltip formatter={(v) => volH(v, 2)} />
                <Legend />
                <Line type="monotone" dataKey="ly" name={`${lastYear} Volume`} dot={false} />
                <Line type="monotone" dataKey="ty" name={`${thisYear} Volume`} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Section>

      {/* Mix and Geography */}
      <Section title="Mix and Geography">
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perIndustry}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey="industry" />
                <YAxis yAxisId="left" tickFormatter={(v) => phpM(v, 1)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => volH(v, 1)} />
                <Tooltip formatter={(v, n) => (n === "revenue" ? phpM(v, 2) : volH(v, 2))} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="Revenue" />
                <Bar yAxisId="right" dataKey="volume" name="Volume" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perArea}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey="area" />
                <YAxis yAxisId="left" tickFormatter={(v) => phpM(v, 1)} />
                <YAxis yAxisId="right" orientation="right" tickFormatter={(v) => volH(v, 1)} />
                <Tooltip formatter={(v, n) => (n === "revenue" ? phpM(v, 2) : volH(v, 2))} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" name="Revenue" />
                <Bar yAxisId="right" dataKey="volume" name="Volume" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Section>

      {/* Accounts */}
      <Section title="Accounts">
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perAccount.slice(0, 25).reverse()} layout="vertical" margin={{ left: 60 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis type="number" tickFormatter={(v) => phpM(v, 1)} />
                <YAxis type="category" dataKey="account" width={120} />
                <Tooltip formatter={(v) => phpM(v, 2)} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...perAccount].slice(0, 25).reverse()} layout="vertical" margin={{ left: 60 }}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis type="number" tickFormatter={(v) => volH(v, 1)} />
                <YAxis type="category" dataKey="account" width={120} />
                <Tooltip formatter={(v) => volH(v, 2)} />
                <Legend />
                <Bar dataKey="volume" name="Volume" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Section>

      {/* Agents */}
      <Section title="Agent Performance">
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perAgent}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey="agent" />
                <YAxis tickFormatter={(v) => phpM(v, 1)} />
                <Tooltip formatter={(v) => phpM(v, 2)} />
                <Legend />
                <Bar dataKey="revenue" name="Revenue per Agent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={[...perAgent].sort((a, b) => b.volume - a.volume)}>
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey="agent" />
                <YAxis tickFormatter={(v) => volH(v, 1)} />
                <Tooltip formatter={(v) => volH(v, 2)} />
                <Legend />
                <Bar dataKey="volume" name="Volume per Agent" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </Section>

      {/* Status by Agent */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Account Status per Agent</h2>
        <Card className="rounded-2xl">
          <CardContent className="p-4 h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusAgent} stackOffset="expand">
                {showGrid && <CartesianGrid strokeDasharray="3 3" />}
                <XAxis dataKey="agent" />
                <YAxis tickFormatter={(v) => `${Math.round(v * 100)}%`} />
                <Tooltip formatter={(v) => phpM(v, 2)} />
                <Legend />
                {baseTY.meta.statuses.map((s) => (
                  <Bar key={s} dataKey={s} stackId="a" name={s} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
