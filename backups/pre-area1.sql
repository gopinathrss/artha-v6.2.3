--
-- PostgreSQL database dump
--

\restrict PdqzX5wRbhkfoNfioVgtXmnHyabHEunTXhaPwkknPDKdhjHBQ4sjSDjAlQ6OdLb

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: AIMemory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AIMemory" (
    id text NOT NULL,
    "sessionDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "questionAsked" text NOT NULL,
    "questionType" text NOT NULL,
    "portfolioSnapshot" jsonb NOT NULL,
    "aiResponse" text NOT NULL,
    "keyNumbers" jsonb,
    recommendations jsonb,
    "confidenceScore" integer DEFAULT 0 NOT NULL,
    "userFeedback" text,
    "wasActioned" boolean DEFAULT false NOT NULL,
    outcome text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AIMemory" OWNER TO postgres;

--
-- Name: Account; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Account" (
    id text NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    institution text,
    "balanceLocal" double precision DEFAULT 0 NOT NULL,
    currency text DEFAULT 'CZK'::text NOT NULL,
    "balanceCzk" double precision DEFAULT 0 NOT NULL,
    "interestRatePct" double precision,
    "maturityDate" timestamp(3) without time zone,
    country text DEFAULT 'CZ'::text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Account" OWNER TO postgres;

--
-- Name: AdvisorJournal; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AdvisorJournal" (
    id text NOT NULL,
    date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    category text NOT NULL,
    content text NOT NULL,
    "relatedIsin" text,
    "impactCzk" double precision,
    metadata jsonb
);


ALTER TABLE public."AdvisorJournal" OWNER TO postgres;

--
-- Name: AlertLog; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AlertLog" (
    id text NOT NULL,
    "triggerType" text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    urgency text DEFAULT 'MEDIUM'::text NOT NULL,
    "dataSnapshot" jsonb,
    "wasSent" boolean DEFAULT false NOT NULL,
    "sentViaEmail" boolean DEFAULT false NOT NULL,
    "sentViaTelegram" boolean DEFAULT false NOT NULL,
    "firedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "sentAt" timestamp(3) without time zone
);


ALTER TABLE public."AlertLog" OWNER TO postgres;

--
-- Name: AllocationPlan; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."AllocationPlan" (
    id text NOT NULL,
    "monthYear" text NOT NULL,
    "generatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "totalAvailableCzk" double precision NOT NULL,
    "fixedExpensesCzk" double precision NOT NULL,
    "reservedEventsCzk" double precision NOT NULL,
    "investableCzk" double precision NOT NULL,
    "emergencyTopupCzk" double precision DEFAULT 0 NOT NULL,
    allocations jsonb NOT NULL,
    status text DEFAULT 'PROPOSED'::text NOT NULL,
    "userOverride" jsonb,
    "executedAt" timestamp(3) without time zone,
    "planSource" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."AllocationPlan" OWNER TO postgres;

--
-- Name: Cashflow; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Cashflow" (
    id text NOT NULL,
    "holdingId" text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "amountCzk" double precision NOT NULL,
    type text DEFAULT 'SIP'::text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Cashflow" OWNER TO postgres;

--
-- Name: ExpenseCommitment; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."ExpenseCommitment" (
    id text NOT NULL,
    category text NOT NULL,
    description text NOT NULL,
    "amountCzk" double precision NOT NULL,
    frequency text NOT NULL,
    "dueDayOfMonth" integer,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone,
    active boolean DEFAULT true NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."ExpenseCommitment" OWNER TO postgres;

--
-- Name: FXRate; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."FXRate" (
    id text NOT NULL,
    base text NOT NULL,
    quote text NOT NULL,
    rate double precision NOT NULL,
    source text NOT NULL,
    stale boolean DEFAULT false NOT NULL,
    "fetchedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."FXRate" OWNER TO postgres;

--
-- Name: GeneratedReport; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."GeneratedReport" (
    id text NOT NULL,
    type text NOT NULL,
    "periodLabel" text NOT NULL,
    "monthYear" text,
    "dataSnapshot" jsonb NOT NULL,
    token text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    audience text DEFAULT 'INTERNAL'::text NOT NULL
);


ALTER TABLE public."GeneratedReport" OWNER TO postgres;

--
-- Name: HistoricalReturn; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."HistoricalReturn" (
    id text NOT NULL,
    isin text NOT NULL,
    "asOfDate" timestamp(3) without time zone NOT NULL,
    return1m double precision,
    return3m double precision,
    return6m double precision,
    return1y double precision,
    return3y double precision,
    return5y double precision,
    return10y double precision,
    volatility double precision,
    sharpe double precision,
    "maxDrawdown" double precision,
    "refreshedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."HistoricalReturn" OWNER TO postgres;

--
-- Name: Holding; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Holding" (
    id text NOT NULL,
    isin text NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'MUTUAL_FUND'::text NOT NULL,
    category text NOT NULL,
    units double precision DEFAULT 0 NOT NULL,
    nav double precision DEFAULT 0 NOT NULL,
    currency text DEFAULT 'CZK'::text NOT NULL,
    "currentValueCzk" double precision DEFAULT 0 NOT NULL,
    "monthlySipCzk" double precision DEFAULT 0 NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "purchaseStartDate" timestamp(3) without time zone NOT NULL,
    "taxFreeDate" timestamp(3) without time zone NOT NULL,
    country text DEFAULT 'CZ'::text NOT NULL,
    institution text,
    "interestRatePct" double precision,
    "maturityDate" timestamp(3) without time zone,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Holding" OWNER TO postgres;

--
-- Name: IncomeEvent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."IncomeEvent" (
    id text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    source text NOT NULL,
    "amountLocal" double precision NOT NULL,
    currency text NOT NULL,
    "amountCzk" double precision NOT NULL,
    recurring boolean DEFAULT false NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."IncomeEvent" OWNER TO postgres;

--
-- Name: IndiaFixedDeposit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."IndiaFixedDeposit" (
    id text NOT NULL,
    bank text NOT NULL,
    "accountType" text NOT NULL,
    "principalInr" double precision NOT NULL,
    "interestRatePct" double precision NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "maturityDate" timestamp(3) without time zone NOT NULL,
    "interestType" text DEFAULT 'CUMULATIVE'::text NOT NULL,
    "tdsApplicable" boolean DEFAULT false NOT NULL,
    "autoRenew" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."IndiaFixedDeposit" OWNER TO postgres;

--
-- Name: IndiaIntelligence; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."IndiaIntelligence" (
    id text NOT NULL,
    "dataType" text NOT NULL,
    "bankName" text,
    tenor text,
    value double precision NOT NULL,
    "previousValue" double precision,
    "changeDirection" text,
    notes text,
    "validFrom" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "validUntil" timestamp(3) without time zone,
    source text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."IndiaIntelligence" OWNER TO postgres;

--
-- Name: IndiaMutualFund; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."IndiaMutualFund" (
    id text NOT NULL,
    "schemeName" text NOT NULL,
    "amfiCode" text NOT NULL,
    isin text,
    amc text,
    category text NOT NULL,
    units double precision NOT NULL,
    "avgNavInr" double precision,
    "currentNavInr" double precision,
    "lastNavUpdate" timestamp(3) without time zone,
    "purchaseDate" timestamp(3) without time zone NOT NULL,
    "folioNumber" text,
    "sipActive" boolean DEFAULT false NOT NULL,
    "sipAmountInr" double precision,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."IndiaMutualFund" OWNER TO postgres;

--
-- Name: Instrument; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Instrument" (
    id text NOT NULL,
    isin text NOT NULL,
    name text NOT NULL,
    ticker text,
    type text NOT NULL,
    category text NOT NULL,
    "terPct" double precision,
    currency text DEFAULT 'EUR'::text NOT NULL,
    "availableInGeorge" boolean DEFAULT false NOT NULL,
    "lastPrice" double precision,
    "lastPriceDate" timestamp(3) without time zone,
    return1yr double precision,
    return3yr double precision,
    return5yr double precision,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."Instrument" OWNER TO postgres;

--
-- Name: InstrumentLibrary; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."InstrumentLibrary" (
    id text NOT NULL,
    isin text NOT NULL,
    name text NOT NULL,
    ticker text,
    type text NOT NULL,
    category text NOT NULL,
    subcategory text,
    "terPct" double precision,
    currency text DEFAULT 'EUR'::text NOT NULL,
    domicile text,
    "fundSizeM" double precision,
    "trackingError" double precision,
    benchmark text,
    "availableInGeorge" boolean DEFAULT false NOT NULL,
    "lastPrice" double precision,
    "lastPriceDate" timestamp(3) without time zone,
    return1yr double precision,
    return3yr double precision,
    return5yr double precision,
    return10yr double precision,
    score double precision,
    "scoreUpdatedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."InstrumentLibrary" OWNER TO postgres;

--
-- Name: MonthlyLetter; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."MonthlyLetter" (
    id text NOT NULL,
    "monthYear" text NOT NULL,
    "generatedAt" timestamp(3) without time zone NOT NULL,
    "contentHtml" text NOT NULL,
    "contentText" text NOT NULL,
    "portfolioSnapshot" jsonb NOT NULL,
    "aiConfidenceScore" integer DEFAULT 0 NOT NULL,
    "wasSent" boolean DEFAULT false NOT NULL,
    "sentAt" timestamp(3) without time zone
);


ALTER TABLE public."MonthlyLetter" OWNER TO postgres;

--
-- Name: NavHistory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."NavHistory" (
    id text NOT NULL,
    isin text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    nav double precision NOT NULL,
    currency text NOT NULL,
    source text NOT NULL
);


ALTER TABLE public."NavHistory" OWNER TO postgres;

--
-- Name: PriceHistory; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."PriceHistory" (
    id text NOT NULL,
    isin text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    price double precision NOT NULL,
    currency text NOT NULL,
    source text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."PriceHistory" OWNER TO postgres;

--
-- Name: RecommendationOutcome; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."RecommendationOutcome" (
    id text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    type text NOT NULL,
    "recommendedAction" text NOT NULL,
    "estimatedImpactCzk" double precision,
    "confidenceScore" integer NOT NULL,
    "relatedIsin" text,
    "userDecision" text DEFAULT 'UNKNOWN'::text NOT NULL,
    result30d text,
    result90d text,
    "actualImpactCzk" double precision,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."RecommendationOutcome" OWNER TO postgres;

--
-- Name: Settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Settings" (
    id text NOT NULL,
    "targetEquityPct" double precision DEFAULT 65 NOT NULL,
    "targetBondsPct" double precision DEFAULT 25 NOT NULL,
    "targetCashPct" double precision DEFAULT 10 NOT NULL,
    "targetWealthCzk" double precision,
    "targetDate" timestamp(3) without time zone,
    "riskProfile" text,
    "alertEmail" text,
    "telegramChatId" text,
    "smtpHost" text DEFAULT 'smtp.gmail.com'::text NOT NULL,
    "smtpPort" integer DEFAULT 587 NOT NULL,
    "smtpUser" text,
    "smtpPass" text,
    "telegramBotToken" text,
    "openaiApiKey" text,
    "aiProvider" text DEFAULT 'openai'::text NOT NULL,
    "monthlyLetterEnabled" boolean DEFAULT true NOT NULL,
    "confidenceEnabled" boolean DEFAULT true NOT NULL,
    "alertsEnabled" boolean DEFAULT true NOT NULL,
    "demoModeEnabled" boolean DEFAULT false NOT NULL,
    "demoPersona" text DEFAULT 'engineer'::text NOT NULL,
    timezone text DEFAULT 'Europe/Prague'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "onboardingComplete" boolean DEFAULT false NOT NULL
);


ALTER TABLE public."Settings" OWNER TO postgres;

--
-- Name: SipExecution; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SipExecution" (
    id text NOT NULL,
    "planId" text,
    "scheduledDate" timestamp(3) without time zone NOT NULL,
    "executedDate" timestamp(3) without time zone,
    isin text NOT NULL,
    "fundName" text NOT NULL,
    "amountCzk" double precision NOT NULL,
    "amountLocal" double precision,
    currency text NOT NULL,
    "navAtExecution" double precision,
    "unitsAcquired" double precision,
    status text NOT NULL,
    "confirmationMethod" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."SipExecution" OWNER TO postgres;

--
-- Name: Snapshot; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."Snapshot" (
    id text NOT NULL,
    date timestamp(3) without time zone NOT NULL,
    "netWorthCzk" double precision NOT NULL,
    "netWorthEur" double precision NOT NULL,
    "investedCzk" double precision NOT NULL,
    "gainCzk" double precision NOT NULL,
    "gainPct" double precision NOT NULL,
    xirr double precision,
    "xirrIsEstimate" boolean DEFAULT true NOT NULL,
    "equityPct" double precision DEFAULT 0 NOT NULL,
    "bondsPct" double precision DEFAULT 0 NOT NULL,
    "cashPct" double precision DEFAULT 0 NOT NULL,
    "healthScore" integer DEFAULT 0 NOT NULL,
    "confidenceScore" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."Snapshot" OWNER TO postgres;

--
-- Name: SystemHealth; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."SystemHealth" (
    id text NOT NULL,
    "checkName" text NOT NULL,
    status text NOT NULL,
    message text,
    "lastSuccessful" timestamp(3) without time zone,
    "checkedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."SystemHealth" OWNER TO postgres;

--
-- Name: UpcomingEvent; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."UpcomingEvent" (
    id text NOT NULL,
    "eventDate" timestamp(3) without time zone NOT NULL,
    title text NOT NULL,
    category text NOT NULL,
    "budgetCzk" double precision NOT NULL,
    "reservedCzk" double precision DEFAULT 0 NOT NULL,
    status text DEFAULT 'UPCOMING'::text NOT NULL,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public."UpcomingEvent" OWNER TO postgres;

--
-- Name: UserProfile; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public."UserProfile" (
    id text DEFAULT 'default'::text NOT NULL,
    "fullName" text NOT NULL,
    "dateOfBirth" timestamp(3) without time zone NOT NULL,
    "homeCurrency" text DEFAULT 'CZK'::text NOT NULL,
    "taxResidency" text DEFAULT 'CZ'::text NOT NULL,
    "riskProfile" text DEFAULT 'MODERATE'::text NOT NULL,
    "monthlyNetIncomeCzk" double precision NOT NULL,
    "salaryDayOfMonth" integer DEFAULT 15 NOT NULL,
    "emergencyFundTarget" double precision NOT NULL,
    "retirementAge" integer DEFAULT 50 NOT NULL,
    "retirementMonthlyExpense" double precision NOT NULL,
    notes text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


ALTER TABLE public."UserProfile" OWNER TO postgres;

--
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO postgres;

--
-- Data for Name: AIMemory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AIMemory" (id, "sessionDate", "questionAsked", "questionType", "portfolioSnapshot", "aiResponse", "keyNumbers", recommendations, "confidenceScore", "userFeedback", "wasActioned", outcome, "createdAt") FROM stdin;
cmolktsi5001hq1ooo15u1ufq	2026-04-30 14:25:58.157	Can I retire by age 50?	RETIREMENT	{"xirr": {"note": "no cashflows", "value": null, "isEstimate": true, "cashflowCount": 0}, "goalFV": null, "health": {"grade": "D", "score": 10, "confidence": 70}, "fxRates": {"EURCZK": 24.5, "EURINR": 89}, "holdings": [], "netWorth": {"gainCzk": 0, "gainPct": 0, "totalCzk": 0, "totalEur": 0, "czechTotal": 0, "indiaFDCzk": 0, "indiaTotal": 0, "fxRatesUsed": {"EURCZK": 24.5, "EURINR": 89}, "indiaNRECzk": 0, "indiaNROCzk": 0, "calculatedAt": "2026-04-30T14:25:58.120Z", "czechFundsCzk": 0, "czechPensionCzk": 0, "czechSavingsCzk": 0}, "settings": {"id": "cmolkpcsu000fq1oooaek3vc6", "smtpHost": "smtp.gmail.com", "smtpPass": null, "smtpPort": 587, "smtpUser": null, "timezone": "Europe/Prague", "createdAt": "2026-04-30T14:22:31.182Z", "updatedAt": "2026-04-30T14:24:01.936Z", "aiProvider": "openai", "alertEmail": null, "targetDate": null, "demoPersona": "engineer", "riskProfile": null, "openaiApiKey": null, "alertsEnabled": true, "targetCashPct": 10, "targetBondsPct": 25, "telegramChatId": null, "demoModeEnabled": false, "targetEquityPct": 65, "targetWealthCzk": null, "telegramBotToken": null, "confidenceEnabled": true, "onboardingComplete": true, "monthlyLetterEnabled": true}, "momChange": {"czk": 0, "pct": 0}, "snapshots": [], "allocation": {"cashCzk": 0, "cashGap": 10, "cashPct": 0, "bondsCzk": 0, "bondsGap": 25, "bondsPct": 0, "equityCzk": 0, "equityGap": 65, "equityPct": 0}, "confidence": 50, "activeCount": 0, "projectedFV": 3060000, "taxCalendar": [], "blendedReturn": 0, "holdingsCount": 0, "totalInvested": 0}	Set ANTHROPIC_API_KEY (recommended) or OpenAI API key in Settings -> Integrations (or env OPENAI_API_KEY).	[]	{}	0	\N	f	\N	2026-04-30 14:25:58.157
\.


--
-- Data for Name: Account; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Account" (id, type, name, institution, "balanceLocal", currency, "balanceCzk", "interestRatePct", "maturityDate", country, "isActive", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: AdvisorJournal; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AdvisorJournal" (id, date, category, content, "relatedIsin", "impactCzk", metadata) FROM stdin;
\.


--
-- Data for Name: AlertLog; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AlertLog" (id, "triggerType", title, message, urgency, "dataSnapshot", "wasSent", "sentViaEmail", "sentViaTelegram", "firedAt", "sentAt") FROM stdin;
\.


--
-- Data for Name: AllocationPlan; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."AllocationPlan" (id, "monthYear", "generatedAt", "totalAvailableCzk", "fixedExpensesCzk", "reservedEventsCzk", "investableCzk", "emergencyTopupCzk", allocations, status, "userOverride", "executedAt", "planSource", "createdAt") FROM stdin;
cmolkrav2001gq1ooo8u9pid3	2026-04	2026-04-30 14:24:01.983	0	11	0	-11	0	[{"reason": "Deficit: income 0 vs obligations 11 CZK. Cut subscriptions or delay events.", "rowKey": "r1", "currency": "CZK", "amountCzk": 0, "destination": "Review fixed costs", "executionStatus": "PENDING"}]	PROPOSED	\N	\N	MANUAL	2026-04-30 14:24:01.983
\.


--
-- Data for Name: Cashflow; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Cashflow" (id, "holdingId", date, "amountCzk", type, notes, "createdAt") FROM stdin;
\.


--
-- Data for Name: ExpenseCommitment; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."ExpenseCommitment" (id, category, description, "amountCzk", frequency, "dueDayOfMonth", "startDate", "endDate", active, notes, "createdAt") FROM stdin;
cmolkrau7001fq1oo1kqgk1me	HOUSING	HOUSING	11	MONTHLY	1	2026-04-01 10:00:00	\N	t	\N	2026-04-30 14:24:01.951
\.


--
-- Data for Name: FXRate; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."FXRate" (id, base, quote, rate, source, stale, "fetchedAt") FROM stdin;
cmolkpcol0000q1ooeboso4ga	CZK	EUR	24.36	CNB+INR_EST	t	2026-04-30 14:22:22.71
cmolkpcox0001q1ooqv33x9rv	CZK	USD	20.813	CNB+INR_EST	t	2026-04-30 14:22:22.71
cmolkpcoz0002q1ood1oa1y6i	CZK	INR	0.2647826086956522	CNB+INR_EST	t	2026-04-30 14:22:22.71
cmolkz692001iq1oo5uxjaprc	CZK	EUR	24.36	CNB+INR_EST	t	2026-04-30 14:30:00.464
cmolkz69e001jq1oo6tax2f0z	CZK	USD	20.813	CNB+INR_EST	t	2026-04-30 14:30:00.464
cmolkz69j001kq1oozhxwojhf	CZK	INR	0.2647826086956522	CNB+INR_EST	t	2026-04-30 14:30:00.464
\.


--
-- Data for Name: GeneratedReport; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."GeneratedReport" (id, type, "periodLabel", "monthYear", "dataSnapshot", token, "createdAt", audience) FROM stdin;
\.


--
-- Data for Name: HistoricalReturn; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."HistoricalReturn" (id, isin, "asOfDate", return1m, return3m, return6m, return1y, return3y, return5y, return10y, volatility, sharpe, "maxDrawdown", "refreshedAt") FROM stdin;
\.


--
-- Data for Name: Holding; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Holding" (id, isin, name, type, category, units, nav, currency, "currentValueCzk", "monthlySipCzk", status, "purchaseStartDate", "taxFreeDate", country, institution, "interestRatePct", "maturityDate", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: IncomeEvent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."IncomeEvent" (id, date, source, "amountLocal", currency, "amountCzk", recurring, notes, "createdAt") FROM stdin;
cmolkrau2001eq1oofhmg658o	2026-04-01 10:00:00	SALARY	0	CZK	0	t	Onboarding	2026-04-30 14:24:01.947
\.


--
-- Data for Name: IndiaFixedDeposit; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."IndiaFixedDeposit" (id, bank, "accountType", "principalInr", "interestRatePct", "startDate", "maturityDate", "interestType", "tdsApplicable", "autoRenew", "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: IndiaIntelligence; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."IndiaIntelligence" (id, "dataType", "bankName", tenor, value, "previousValue", "changeDirection", notes, "validFrom", "validUntil", source, "createdAt") FROM stdin;
cmolkpcvn000yq1oontin0nyh	NRE_FD_RATE	HDFC Bank	1yr	7.25	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.284
cmolkpcvr000zq1oo1cyx359e	NRE_FD_RATE	HDFC Bank	2yr	7.25	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.287
cmolkpcvu0010q1oomamyslme	NRE_FD_RATE	HDFC Bank	3yr	7	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.29
cmolkpcvw0011q1oos5n9i2sx	NRE_FD_RATE	SBI	1yr	7	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.293
cmolkpcvz0012q1ooy6k388d6	NRE_FD_RATE	SBI	2yr	7	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.295
cmolkpcw30013q1oor392js6c	NRE_FD_RATE	SBI	3yr	6.8	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.3
cmolkpcw80014q1oowwmwp9rb	NRE_FD_RATE	ICICI Bank	1yr	7.1	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.304
cmolkpcwa0015q1ooh3fl6pv5	NRE_FD_RATE	ICICI Bank	2yr	7.1	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.306
cmolkpcwc0016q1oo2vk5a0ag	NRE_FD_RATE	ICICI Bank	3yr	7	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.309
cmolkpcwf0017q1oonjpdx39y	NRE_FD_RATE	Axis Bank	1yr	7.2	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.311
cmolkpcwi0018q1oox9efxluz	NRE_FD_RATE	Axis Bank	2yr	7.15	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.315
cmolkpcwk0019q1oo0wqizwsf	NRE_FD_RATE	Axis Bank	3yr	7	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.317
cmolkpcwn001aq1oo7bk76rnz	NRE_FD_RATE	Kotak	1yr	7.15	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.319
cmolkpcwq001bq1oovvr8ge80	NRE_FD_RATE	Kotak	2yr	7.1	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.322
cmolkpcwt001cq1oogpnzhvaf	NRE_FD_RATE	Kotak	3yr	7	\N	\N	\N	2026-04-01 00:00:00	\N	BANK_CARDS_APR_2026	2026-04-30 14:22:31.325
cmolkpcx7001dq1ooa4l0w380	RBI_RATE	\N	\N	6.5	\N	STABLE	\N	2026-04-30 14:22:31.337	\N	RBI_REPOLICY_EST	2026-04-30 14:22:31.34
\.


--
-- Data for Name: IndiaMutualFund; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."IndiaMutualFund" (id, "schemeName", "amfiCode", isin, amc, category, units, "avgNavInr", "currentNavInr", "lastNavUpdate", "purchaseDate", "folioNumber", "sipActive", "sipAmountInr", notes, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: Instrument; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Instrument" (id, isin, name, ticker, type, category, "terPct", currency, "availableInGeorge", "lastPrice", "lastPriceDate", return1yr, return3yr, return5yr, "createdAt", "updatedAt") FROM stdin;
\.


--
-- Data for Name: InstrumentLibrary; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."InstrumentLibrary" (id, isin, name, ticker, type, category, subcategory, "terPct", currency, domicile, "fundSizeM", "trackingError", benchmark, "availableInGeorge", "lastPrice", "lastPriceDate", return1yr, return3yr, return5yr, return10yr, score, "scoreUpdatedAt", "createdAt", "updatedAt") FROM stdin;
cmolkpcpc0003q1oogqm2urt7	IE00B4L5Y983	iShares Core MSCI World	SWDA.DE	ETF	EQUITY	Global Equity	0.2	EUR	IE	85000	0.03	MSCI World	t	\N	\N	22.4	11.8	13.2	11.9	92	2026-04-30 14:22:31.053	2026-04-30 14:22:31.056	2026-04-30 14:22:31.056
cmolkpcph0004q1oow737nfn4	IE00BKM4GZ66	iShares Core MSCI EM IMI	EIMI.DE	ETF	EQUITY	Emerging Markets	0.18	EUR	IE	22000	0.12	MSCI EM IMI	t	\N	\N	11.2	4.8	6.1	5.4	72	2026-04-30 14:22:31.058	2026-04-30 14:22:31.061	2026-04-30 14:22:31.061
cmolkpcpl0005q1ooto1fcpri	IE00B3XXRP09	Vanguard S&P 500 UCITS ETF	VUSA.DE	ETF	EQUITY	US Large Cap	0.07	USD	IE	48000	0.02	S&P 500	t	\N	\N	24.1	13.4	15.8	13.2	96	2026-04-30 14:22:31.062	2026-04-30 14:22:31.065	2026-04-30 14:22:31.065
cmolkpcpo0006q1oofkinxlf3	IE00B52MJY50	iShares Core S&P 500	CSPX.L	ETF	EQUITY	US Large Cap	0.07	USD	IE	52000	0.02	S&P 500	t	\N	\N	24	13.3	15.7	13.1	96	2026-04-30 14:22:31.065	2026-04-30 14:22:31.068	2026-04-30 14:22:31.068
cmolkpcpr0007q1oogsv4axtk	IE00BFY0GT14	SPDR MSCI World Small Cap	WLDS.DE	ETF	EQUITY	Global Small Cap	0.45	EUR	IE	2200	0.18	MSCI World Small Cap	t	\N	\N	16.2	7.4	9.1	9.8	75	2026-04-30 14:22:31.068	2026-04-30 14:22:31.071	2026-04-30 14:22:31.071
cmolkpcpt0008q1oo789xczsh	IE00B3F81H35	iShares EUR Corp Bond	IEAC.DE	ETF	BONDS	EUR Corporate Bond	0.2	EUR	IE	8500	0.05	Bloomberg EUR Corp Bond	t	\N	\N	3.8	0.2	1.4	2.8	61	2026-04-30 14:22:31.071	2026-04-30 14:22:31.074	2026-04-30 14:22:31.074
cmolkpcpw0009q1ooy2hpueyn	IE00B14X4T88	iShares EUR Govt Bond 7-10yr	IBGX.DE	ETF	BONDS	EUR Government Bond	0.15	EUR	IE	4200	0.04	Bloomberg EUR Govt 7-10yr	t	\N	\N	1.2	-3.4	-1.2	1.8	53	2026-04-30 14:22:31.074	2026-04-30 14:22:31.077	2026-04-30 14:22:31.077
cmolkpcpz000aq1oojalt2vsf	IE00B4WXJJ64	iShares Global Corp Bond Hdg	CRPH.DE	ETF	BONDS	Global Corp Bond Hedged	0.25	EUR	IE	3100	0.08	Bloomberg Global Corp Hdg EUR	t	\N	\N	4.2	0.8	2.1	3.2	60	2026-04-30 14:22:31.076	2026-04-30 14:22:31.079	2026-04-30 14:22:31.079
cmolkpcq1000bq1oowqwwzkft	IE00B5BMR087	iShares Physical Gold	IGLN.DE	ETF	COMMODITY	Gold	0.12	USD	IE	12000	0.01	Gold spot price	t	\N	\N	28.4	14.2	12.8	8.4	97	2026-04-30 14:22:31.079	2026-04-30 14:22:31.081	2026-04-30 14:22:31.081
cmolkpcq3000cq1oo0rueakdz	IE00BYWQWR46	iShares Core Global Agg Bond	AGGH.DE	ETF	BONDS	Global Aggregate Hedged	0.1	EUR	IE	6800	0.06	Bloomberg Global Agg EUR Hdg	t	\N	\N	3.1	-0.8	0.9	2.2	60	2026-04-30 14:22:31.081	2026-04-30 14:22:31.084	2026-04-30 14:22:31.084
cmolkpcq8000dq1oos2mytrn9	IE00B52VJ196	iShares MSCI Europe	IMEU.DE	ETF	EQUITY	European Equity	0.12	EUR	IE	9200	0.04	MSCI Europe	t	\N	\N	8.4	7.2	8.9	7.8	80	2026-04-30 14:22:31.086	2026-04-30 14:22:31.088	2026-04-30 14:22:31.088
cmolkpcqi000eq1oomb13o41d	IE00B3VVMM84	Vanguard FTSE All-World	VWRL.DE	ETF	EQUITY	Global All-World	0.22	USD	IE	18000	0.05	FTSE All-World	t	\N	\N	21.8	10.9	12.4	10.8	90	2026-04-30 14:22:31.096	2026-04-30 14:22:31.099	2026-04-30 14:22:31.099
cmolkpct0000gq1ooy3fs6ogy	IE00BK5BQT80	Vanguard FTSE All-World Acc	VWCE.DE	ETF	EQUITY	Global All-World Acc	0.22	USD	IE	22000	0.05	FTSE All-World	t	\N	\N	21.9	11	12.5	10.9	90	2026-04-30 14:22:31.1	2026-04-30 14:22:31.102	2026-04-30 14:22:31.102
cmolkpct7000hq1oouc4tqb0n	LU1681043599	Amundi MSCI World II	LCWL.DE	ETF	EQUITY	Global Equity	0.12	EUR	LU	4800	0.06	MSCI World	t	\N	\N	22.1	11.5	12.9	\N	85	2026-04-30 14:22:31.193	2026-04-30 14:22:31.196	2026-04-30 14:22:31.196
cmolkpctc000iq1ooi2qn6y7d	IE00B6TLBW47	iShares MSCI World SRI	SUWS.DE	ETF	EQUITY	Global ESG Equity	0.2	EUR	IE	2800	0.08	MSCI World SRI	t	\N	\N	18.4	8.2	10.1	\N	77	2026-04-30 14:22:31.198	2026-04-30 14:22:31.2	2026-04-30 14:22:31.2
cmolkpcti000jq1ooqu67et9w	IE00B66F4759	iShares Core MSCI Japan	IJPA.DE	ETF	EQUITY	Japan Equity	0.15	JPY	IE	3400	0.05	MSCI Japan	t	\N	\N	12.8	10.4	8.2	7.6	84	2026-04-30 14:22:31.204	2026-04-30 14:22:31.207	2026-04-30 14:22:31.207
cmolkpcto000kq1ookh971yky	IE00B3RBWM25	Vanguard FTSE Developed World	VEVE.DE	ETF	EQUITY	Developed Markets	0.12	USD	IE	8900	0.04	FTSE Developed	t	\N	\N	22.2	11.4	13	11.1	92	2026-04-30 14:22:31.208	2026-04-30 14:22:31.212	2026-04-30 14:22:31.212
cmolkpctu000lq1oohet6btds	IE00B14X4S71	iShares MSCI AC Far East ex-JP	IFFF.DE	ETF	EQUITY	Asia Pacific ex Japan	0.74	USD	IE	1200	0.18	MSCI AC Far East ex-JP	t	\N	\N	9.4	2.8	4.1	5.2	60	2026-04-30 14:22:31.215	2026-04-30 14:22:31.218	2026-04-30 14:22:31.218
cmolkpctx000mq1oonztbl6gp	IE00B53QG562	iShares NASDAQ 100	CNDX.DE	ETF	EQUITY	US Technology	0.33	USD	IE	12000	0.04	NASDAQ-100	t	\N	\N	28.4	12.8	20.1	18.4	92	2026-04-30 14:22:31.218	2026-04-30 14:22:31.221	2026-04-30 14:22:31.221
cmolkpcu0000nq1oogfl94io6	IE00B4L5YC18	iShares Core S&P 500 Acc	CSPX.DE	ETF	EQUITY	US Large Cap Acc	0.07	USD	IE	52000	0.02	S&P 500	t	\N	\N	24.1	13.4	15.8	13.2	96	2026-04-30 14:22:31.222	2026-04-30 14:22:31.225	2026-04-30 14:22:31.225
cmolkpcu4000oq1ooh3u0mv1y	IE00B3F81409	iShares EUR High Yield Corp Bond	IHYG.DE	ETF	BONDS	EUR High Yield	0.5	EUR	IE	5600	0.12	Markit iBoxx EUR Liq HY	t	\N	\N	6.8	3.2	3.8	4.4	65	2026-04-30 14:22:31.226	2026-04-30 14:22:31.229	2026-04-30 14:22:31.229
cmolkpcu9000pq1oom5htm3fc	IE00B2Q88X52	iShares Physical Gold ETC (LSE)	IGLN.L	ETF	COMMODITY	Gold ETC	0.12	USD	IE	12000	0.01	Gold spot	t	\N	\N	28.4	14.2	12.8	8.4	97	2026-04-30 14:22:31.23	2026-04-30 14:22:31.233	2026-04-30 14:22:31.233
cmolkpcuc000qq1ooggyvieea	IE00BZ163G84	iShares MSCI World Small Cap Alt	WLDS.L	ETF	EQUITY	Global Small Cap	0.35	USD	IE	3400	0.15	MSCI World Small Cap	t	\N	\N	16.4	7.6	9.4	10.1	77	2026-04-30 14:22:31.233	2026-04-30 14:22:31.236	2026-04-30 14:22:31.236
cmolkpcue000rq1ooubmcv3xt	LU0908500753	Amundi S&P 500 ESG	500ESG.PA	ETF	EQUITY	US ESG	0.12	EUR	LU	2100	0.08	S&P 500 ESG	t	\N	\N	22.8	11.2	14.1	\N	84	2026-04-30 14:22:31.236	2026-04-30 14:22:31.238	2026-04-30 14:22:31.238
cmolkpcuh000sq1oo7qert6lc	IE00B8X9K012	iShares Core MSCI World USD Hdg	IWDH.DE	ETF	EQUITY	Global Equity USD Hedged	0.55	EUR	IE	1800	0.08	MSCI World USD Hedged	t	\N	\N	18.2	9.4	11.2	\N	76	2026-04-30 14:22:31.238	2026-04-30 14:22:31.241	2026-04-30 14:22:31.241
cmolkpcuk000tq1oo3mrar93s	IE00B4X0QJ59	iShares Core MSCI Europe	IMEA.DE	ETF	EQUITY	European Equity	0.12	EUR	IE	9800	0.04	MSCI Europe	t	\N	\N	9.2	7.8	9.2	8.1	84	2026-04-30 14:22:31.241	2026-04-30 14:22:31.244	2026-04-30 14:22:31.244
cmolkpcuq000uq1oovteq5p6n	IE00B1FZS350	iShares USD Treasury 7-10yr Hdg	IBTM.DE	ETF	BONDS	US Treasury Hedged	0.1	EUR	IE	2800	0.04	ICE US Treasury 7-10yr Hdg	t	\N	\N	2.4	-2.8	-0.8	1.4	54	2026-04-30 14:22:31.248	2026-04-30 14:22:31.251	2026-04-30 14:22:31.251
cmolkpcux000vq1oobaibx1mk	IE00B1C2PL88	iShares EUR Corp Bond 1-5yr	SE15.DE	ETF	BONDS	EUR Short Corp	0.2	EUR	IE	4200	0.04	Bloomberg EUR Corp 1-5yr	t	\N	\N	4.2	1.8	2.2	2.6	63	2026-04-30 14:22:31.255	2026-04-30 14:22:31.258	2026-04-30 14:22:31.258
cmolkpcv6000wq1oogqqw2to1	IE00B0M91N52	iShares Diversified Commodity Swap	COMM.DE	ETF	COMMODITY	Diversified Commodity	0.19	USD	IE	1600	0.12	Bloomberg Commodity	t	\N	\N	4.8	2.4	5.2	1.8	61	2026-04-30 14:22:31.263	2026-04-30 14:22:31.267	2026-04-30 14:22:31.267
cmolkpcva000xq1oou0fv5lgo	IE00B1C1HY88	Xtrackers EUR Corp Bond Hdg	XBLC.DE	ETF	BONDS	EUR Corp Hedged	0.16	EUR	IE	2400	0.06	Bloomberg EUR Corp Hdg	t	\N	\N	4.1	0.4	1.6	2.9	60	2026-04-30 14:22:31.267	2026-04-30 14:22:31.27	2026-04-30 14:22:31.27
\.


--
-- Data for Name: MonthlyLetter; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."MonthlyLetter" (id, "monthYear", "generatedAt", "contentHtml", "contentText", "portfolioSnapshot", "aiConfidenceScore", "wasSent", "sentAt") FROM stdin;
\.


--
-- Data for Name: NavHistory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."NavHistory" (id, isin, date, nav, currency, source) FROM stdin;
\.


--
-- Data for Name: PriceHistory; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."PriceHistory" (id, isin, date, price, currency, source, "createdAt") FROM stdin;
\.


--
-- Data for Name: RecommendationOutcome; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."RecommendationOutcome" (id, date, type, "recommendedAction", "estimatedImpactCzk", "confidenceScore", "relatedIsin", "userDecision", result30d, result90d, "actualImpactCzk", notes, "createdAt") FROM stdin;
\.


--
-- Data for Name: Settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Settings" (id, "targetEquityPct", "targetBondsPct", "targetCashPct", "targetWealthCzk", "targetDate", "riskProfile", "alertEmail", "telegramChatId", "smtpHost", "smtpPort", "smtpUser", "smtpPass", "telegramBotToken", "openaiApiKey", "aiProvider", "monthlyLetterEnabled", "confidenceEnabled", "alertsEnabled", "demoModeEnabled", "demoPersona", timezone, "createdAt", "updatedAt", "onboardingComplete") FROM stdin;
cmolkpcsu000fq1oooaek3vc6	65	25	10	\N	\N	\N	\N	\N	smtp.gmail.com	587	\N	\N	\N	\N	openai	t	t	t	f	engineer	Europe/Prague	2026-04-30 14:22:31.182	2026-04-30 14:24:01.936	t
\.


--
-- Data for Name: SipExecution; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SipExecution" (id, "planId", "scheduledDate", "executedDate", isin, "fundName", "amountCzk", "amountLocal", currency, "navAtExecution", "unitsAcquired", status, "confirmationMethod", notes, "createdAt") FROM stdin;
\.


--
-- Data for Name: Snapshot; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."Snapshot" (id, date, "netWorthCzk", "netWorthEur", "investedCzk", "gainCzk", "gainPct", xirr, "xirrIsEstimate", "equityPct", "bondsPct", "cashPct", "healthScore", "confidenceScore", "createdAt") FROM stdin;
\.


--
-- Data for Name: SystemHealth; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."SystemHealth" (id, "checkName", status, message, "lastSuccessful", "checkedAt") FROM stdin;
\.


--
-- Data for Name: UpcomingEvent; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."UpcomingEvent" (id, "eventDate", title, category, "budgetCzk", "reservedCzk", status, notes, "createdAt") FROM stdin;
\.


--
-- Data for Name: UserProfile; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public."UserProfile" (id, "fullName", "dateOfBirth", "homeCurrency", "taxResidency", "riskProfile", "monthlyNetIncomeCzk", "salaryDayOfMonth", "emergencyFundTarget", "retirementAge", "retirementMonthlyExpense", notes, "updatedAt") FROM stdin;
default	Gopinath	1994-03-05 00:00:00	CZK	CZ	MODERATE	0	15	66	50	35000	\N	2026-04-30 14:24:01.941
\.


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
a125dca6-46f8-4c90-bc16-fc9533ae6ef4	3af49941bf242be5d88cb8d8af086cc2b91bd39fdd3f1da5ac85c2ebda027159	2026-04-30 16:03:41.570685+02	20260425164156_init	\N	\N	2026-04-30 16:03:41.455883+02	1
54482abc-b61c-4f1a-a795-410852e3d059	7918fba82c23af042897cc24ccea328f7fd8640359ee6e87f0b6bd35e660dcc8	2026-04-30 16:03:41.609598+02	20260425204752_v3_intelligence	\N	\N	2026-04-30 16:03:41.572436+02	1
498414e9-6f34-4166-9c37-ae7bc301c220	38df5bec4d8e8081348254f0d3ee01777e43387a5ad97207ccf8ade62406f666	2026-04-30 16:03:41.731219+02	20260427095245_v4_cfo_foundation	\N	\N	2026-04-30 16:03:41.611176+02	1
fb7cf12a-b77e-4d96-85ee-fc5b90ab880e	2872aa78128c1e783690a3c45d864b3d4fd5823e8f5eff2f8884e35d0cb5054f	2026-04-30 16:03:41.755234+02	20260427140000_v4_india_mf_fd	\N	\N	2026-04-30 16:03:41.732711+02	1
8aef8c2b-abfa-47d5-bbd7-df9f45474a00	dea1e4d1432db3cf5c495d1cf127a4da114f1c5c11355e9b18c989495ba5d4a7	2026-04-30 16:03:41.775053+02	20260428120000_v4_generated_report	\N	\N	2026-04-30 16:03:41.756553+02	1
6be14a9b-70bc-41db-a4ab-0090f3fff0fa	95a467bfc0daf5d05ace012dbc1e463a1e4dc86f9a0280587c4bdd9709294bd5	2026-04-30 16:03:41.782459+02	20260428140000_v4_onboarding	\N	\N	2026-04-30 16:03:41.776392+02	1
be7fd423-9ac1-482a-bbcc-4c144d774740	ed9988bac559e617157f2ddf32c2b49a448f518544efcf44c0fa3af194d12dfe	2026-04-30 16:03:41.789382+02	20260428150000_v4_report_audience	\N	\N	2026-04-30 16:03:41.78423+02	1
\.


--
-- Name: AIMemory AIMemory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AIMemory"
    ADD CONSTRAINT "AIMemory_pkey" PRIMARY KEY (id);


--
-- Name: Account Account_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY (id);


--
-- Name: AdvisorJournal AdvisorJournal_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AdvisorJournal"
    ADD CONSTRAINT "AdvisorJournal_pkey" PRIMARY KEY (id);


--
-- Name: AlertLog AlertLog_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AlertLog"
    ADD CONSTRAINT "AlertLog_pkey" PRIMARY KEY (id);


--
-- Name: AllocationPlan AllocationPlan_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."AllocationPlan"
    ADD CONSTRAINT "AllocationPlan_pkey" PRIMARY KEY (id);


--
-- Name: Cashflow Cashflow_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Cashflow"
    ADD CONSTRAINT "Cashflow_pkey" PRIMARY KEY (id);


--
-- Name: ExpenseCommitment ExpenseCommitment_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."ExpenseCommitment"
    ADD CONSTRAINT "ExpenseCommitment_pkey" PRIMARY KEY (id);


--
-- Name: FXRate FXRate_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."FXRate"
    ADD CONSTRAINT "FXRate_pkey" PRIMARY KEY (id);


--
-- Name: GeneratedReport GeneratedReport_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."GeneratedReport"
    ADD CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY (id);


--
-- Name: HistoricalReturn HistoricalReturn_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."HistoricalReturn"
    ADD CONSTRAINT "HistoricalReturn_pkey" PRIMARY KEY (id);


--
-- Name: Holding Holding_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Holding"
    ADD CONSTRAINT "Holding_pkey" PRIMARY KEY (id);


--
-- Name: IncomeEvent IncomeEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."IncomeEvent"
    ADD CONSTRAINT "IncomeEvent_pkey" PRIMARY KEY (id);


--
-- Name: IndiaFixedDeposit IndiaFixedDeposit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."IndiaFixedDeposit"
    ADD CONSTRAINT "IndiaFixedDeposit_pkey" PRIMARY KEY (id);


--
-- Name: IndiaIntelligence IndiaIntelligence_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."IndiaIntelligence"
    ADD CONSTRAINT "IndiaIntelligence_pkey" PRIMARY KEY (id);


--
-- Name: IndiaMutualFund IndiaMutualFund_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."IndiaMutualFund"
    ADD CONSTRAINT "IndiaMutualFund_pkey" PRIMARY KEY (id);


--
-- Name: InstrumentLibrary InstrumentLibrary_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."InstrumentLibrary"
    ADD CONSTRAINT "InstrumentLibrary_pkey" PRIMARY KEY (id);


--
-- Name: Instrument Instrument_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Instrument"
    ADD CONSTRAINT "Instrument_pkey" PRIMARY KEY (id);


--
-- Name: MonthlyLetter MonthlyLetter_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."MonthlyLetter"
    ADD CONSTRAINT "MonthlyLetter_pkey" PRIMARY KEY (id);


--
-- Name: NavHistory NavHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."NavHistory"
    ADD CONSTRAINT "NavHistory_pkey" PRIMARY KEY (id);


--
-- Name: PriceHistory PriceHistory_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."PriceHistory"
    ADD CONSTRAINT "PriceHistory_pkey" PRIMARY KEY (id);


--
-- Name: RecommendationOutcome RecommendationOutcome_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."RecommendationOutcome"
    ADD CONSTRAINT "RecommendationOutcome_pkey" PRIMARY KEY (id);


--
-- Name: Settings Settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Settings"
    ADD CONSTRAINT "Settings_pkey" PRIMARY KEY (id);


--
-- Name: SipExecution SipExecution_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SipExecution"
    ADD CONSTRAINT "SipExecution_pkey" PRIMARY KEY (id);


--
-- Name: Snapshot Snapshot_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Snapshot"
    ADD CONSTRAINT "Snapshot_pkey" PRIMARY KEY (id);


--
-- Name: SystemHealth SystemHealth_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."SystemHealth"
    ADD CONSTRAINT "SystemHealth_pkey" PRIMARY KEY (id);


--
-- Name: UpcomingEvent UpcomingEvent_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UpcomingEvent"
    ADD CONSTRAINT "UpcomingEvent_pkey" PRIMARY KEY (id);


--
-- Name: UserProfile UserProfile_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."UserProfile"
    ADD CONSTRAINT "UserProfile_pkey" PRIMARY KEY (id);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


--
-- Name: AllocationPlan_monthYear_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "AllocationPlan_monthYear_status_idx" ON public."AllocationPlan" USING btree ("monthYear", status);


--
-- Name: FXRate_base_quote_fetchedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "FXRate_base_quote_fetchedAt_idx" ON public."FXRate" USING btree (base, quote, "fetchedAt");


--
-- Name: GeneratedReport_token_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "GeneratedReport_token_key" ON public."GeneratedReport" USING btree (token);


--
-- Name: HistoricalReturn_isin_asOfDate_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "HistoricalReturn_isin_asOfDate_key" ON public."HistoricalReturn" USING btree (isin, "asOfDate");


--
-- Name: InstrumentLibrary_isin_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "InstrumentLibrary_isin_key" ON public."InstrumentLibrary" USING btree (isin);


--
-- Name: Instrument_isin_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Instrument_isin_key" ON public."Instrument" USING btree (isin);


--
-- Name: MonthlyLetter_monthYear_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "MonthlyLetter_monthYear_key" ON public."MonthlyLetter" USING btree ("monthYear");


--
-- Name: NavHistory_isin_date_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "NavHistory_isin_date_key" ON public."NavHistory" USING btree (isin, date);


--
-- Name: NavHistory_isin_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "NavHistory_isin_idx" ON public."NavHistory" USING btree (isin);


--
-- Name: PriceHistory_isin_date_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "PriceHistory_isin_date_key" ON public."PriceHistory" USING btree (isin, date);


--
-- Name: Snapshot_date_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "Snapshot_date_key" ON public."Snapshot" USING btree (date);


--
-- Name: SystemHealth_checkName_checkedAt_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "SystemHealth_checkName_checkedAt_idx" ON public."SystemHealth" USING btree ("checkName", "checkedAt");


--
-- Name: Cashflow Cashflow_holdingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public."Cashflow"
    ADD CONSTRAINT "Cashflow_holdingId_fkey" FOREIGN KEY ("holdingId") REFERENCES public."Holding"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict PdqzX5wRbhkfoNfioVgtXmnHyabHEunTXhaPwkknPDKdhjHBQ4sjSDjAlQ6OdLb

