--
-- PostgreSQL database dump
--

\restrict AeUvMNsXTfa7GY13DZ8IbdtIln1dcwFXJdvtF4LK3BUaP95IC3WV2wi8km2kZHH

-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

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

--
-- Name: drizzle; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA "drizzle";


--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: academic_course_source; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."academic_course_source" AS ENUM (
    'manual',
    'ava',
    'ava_extension'
);


--
-- Name: assistant_message_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."assistant_message_role" AS ENUM (
    'user',
    'assistant'
);


--
-- Name: ava_dom_import_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."ava_dom_import_status" AS ENUM (
    'draft',
    'confirmed',
    'discarded'
);


--
-- Name: chat_member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."chat_member_role" AS ENUM (
    'member',
    'admin',
    'owner'
);


--
-- Name: chat_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."chat_type" AS ENUM (
    'direct',
    'group'
);


--
-- Name: duco_draft_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."duco_draft_kind" AS ENUM (
    'task',
    'support_request'
);


--
-- Name: duco_draft_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."duco_draft_status" AS ENUM (
    'collecting_information',
    'ready_for_review',
    'confirmed',
    'cancelled',
    'expired'
);


--
-- Name: message_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."message_type" AS ENUM (
    'text',
    'image',
    'file',
    'poll',
    'system'
);


--
-- Name: moderation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."moderation_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: notification_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."notification_type" AS ENUM (
    'connection',
    'like',
    'comment',
    'reply',
    'message',
    'task',
    'moderation',
    'support_request'
);


--
-- Name: post_content_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."post_content_type" AS ENUM (
    'announcement',
    'community'
);


--
-- Name: post_visibility; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."post_visibility" AS ENUM (
    'campus',
    'connections',
    'public'
);


--
-- Name: report_resource_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."report_resource_type" AS ENUM (
    'post',
    'comment',
    'chat',
    'message',
    'user'
);


--
-- Name: report_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."report_status" AS ENUM (
    'pending',
    'reviewing',
    'resolved',
    'dismissed'
);


--
-- Name: study_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."study_method" AS ENUM (
    'pomodoro',
    'pomodoro_extended',
    'deep_work',
    'flowtime',
    'custom'
);


--
-- Name: study_session_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."study_session_event_type" AS ENUM (
    'start',
    'pause',
    'resume',
    'complete',
    'cancel'
);


--
-- Name: study_session_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."study_session_status" AS ENUM (
    'active',
    'paused',
    'completed',
    'cancelled'
);


--
-- Name: support_request_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."support_request_category" AS ENUM (
    'section_change',
    'missing_course',
    'enrollment',
    'schedule_conflict',
    'harassment',
    'technical',
    'financial',
    'wellbeing',
    'other'
);


--
-- Name: support_request_event_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."support_request_event_type" AS ENUM (
    'created',
    'status_changed',
    'response'
);


--
-- Name: support_request_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."support_request_status" AS ENUM (
    'pending',
    'reviewing',
    'resolved',
    'rejected'
);


--
-- Name: support_request_urgency; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."support_request_urgency" AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: task_priority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."task_priority" AS ENUM (
    'low',
    'medium',
    'high'
);


--
-- Name: task_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."task_status" AS ENUM (
    'pending',
    'in_progress',
    'completed'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."user_role" AS ENUM (
    'student',
    'professor',
    'moderator',
    'admin'
);


--
-- Name: user_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE "public"."user_status" AS ENUM (
    'active',
    'suspended',
    'deleted'
);


SET default_table_access_method = "heap";

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: drizzle; Owner: -
--

CREATE TABLE "drizzle"."__drizzle_migrations" (
    "id" integer NOT NULL,
    "hash" "text" NOT NULL,
    "created_at" bigint
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: drizzle; Owner: -
--

CREATE SEQUENCE "drizzle"."__drizzle_migrations_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: drizzle; Owner: -
--

ALTER SEQUENCE "drizzle"."__drizzle_migrations_id_seq" OWNED BY "drizzle"."__drizzle_migrations"."id";


--
-- Name: academic_calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."academic_calendar_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "external_id" character varying(64) NOT NULL,
    "uid" character varying(500),
    "title" character varying(300) NOT NULL,
    "description" "text",
    "location" character varying(300),
    "course_name" character varying(300),
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone,
    "all_day" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "last_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: academic_calendar_syncs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."academic_calendar_syncs" (
    "user_id" "uuid" NOT NULL,
    "last_synced_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_event_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: academic_courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."academic_courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" character varying(300) NOT NULL,
    "normalized_name" character varying(300) NOT NULL,
    "code" character varying(80),
    "section" character varying(80),
    "term" character varying(100),
    "source" "public"."academic_course_source" DEFAULT 'manual'::"public"."academic_course_source" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: academic_tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."academic_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "course_id" "uuid",
    "title" character varying(160) NOT NULL,
    "description" character varying(1000),
    "due_at" timestamp with time zone,
    "priority" "public"."task_priority" DEFAULT 'medium'::"public"."task_priority" NOT NULL,
    "status" "public"."task_status" DEFAULT 'pending'::"public"."task_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_source" character varying(32),
    "external_id" character varying(64)
);


--
-- Name: assistant_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."assistant_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."assistant_message_role" NOT NULL,
    "content" character varying(8000) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action" "jsonb"
);


--
-- Name: ava_dom_imports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."ava_dom_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "payload_digest" character varying(64) NOT NULL,
    "payload" "jsonb" NOT NULL,
    "status" "public"."ava_dom_import_status" DEFAULT 'draft'::"public"."ava_dom_import_status" NOT NULL,
    "result" "jsonb",
    "expires_at" timestamp with time zone NOT NULL,
    "confirmed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: chat_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_participants" (
    "chat_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."chat_member_role" DEFAULT 'member'::"public"."chat_member_role" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone
);


--
-- Name: chat_reads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chat_reads" (
    "chat_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "public"."chat_type" DEFAULT 'direct'::"public"."chat_type" NOT NULL,
    "direct_key" character varying(73),
    "name" character varying(120),
    "avatar_url" "text",
    "created_by_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" character varying(1000) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parent_comment_id" "uuid"
);


--
-- Name: connection_intents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."connection_intents" (
    "requester_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    CONSTRAINT "connection_intents_cannot_request_self" CHECK (("requester_id" <> "recipient_id"))
);


--
-- Name: connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."connections" (
    "user_one_id" "uuid" NOT NULL,
    "user_two_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "connections_canonical_pair" CHECK (("user_one_id" < "user_two_id"))
);


--
-- Name: duco_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."duco_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "kind" "public"."duco_draft_kind" NOT NULL,
    "status" "public"."duco_draft_status" DEFAULT 'collecting_information'::"public"."duco_draft_status" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "source_message_id" "uuid",
    "completed_resource_id" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '30 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: message_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."message_receipts" (
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "delivered_at" timestamp with time zone,
    "read_at" timestamp with time zone
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" character varying(4000) DEFAULT ''::character varying NOT NULL,
    "type" "public"."message_type" DEFAULT 'text'::"public"."message_type" NOT NULL,
    "file_url" "text",
    "file_name" character varying(255),
    "file_size" integer,
    "tags" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "type" "public"."notification_type" NOT NULL,
    "title" character varying(160) NOT NULL,
    "body" character varying(500) NOT NULL,
    "href" character varying(500),
    "resource_id" "uuid",
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: poll_options; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "poll_id" "uuid" NOT NULL,
    "label" character varying(40) NOT NULL,
    "position" integer NOT NULL
);


--
-- Name: poll_votes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."poll_votes" (
    "poll_id" "uuid" NOT NULL,
    "option_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: polls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."polls" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "question" character varying(80) NOT NULL,
    "allow_multiple" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: post_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."post_likes" (
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid" NOT NULL,
    "content" character varying(2000) NOT NULL,
    "image_url" "text",
    "visibility" "public"."post_visibility" DEFAULT 'campus'::"public"."post_visibility" NOT NULL,
    "moderation_status" "public"."moderation_status" DEFAULT 'pending'::"public"."moderation_status" NOT NULL,
    "moderation_reason" character varying(500),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "content_type" "public"."post_content_type" DEFAULT 'community'::"public"."post_content_type" NOT NULL,
    "share_count" integer DEFAULT 0 NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "username" character varying(40) NOT NULL,
    "display_name" character varying(100) NOT NULL,
    "bio" character varying(280),
    "institution" character varying(160),
    "career" character varying(160),
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "cover_url" "text",
    "campus" character varying(160),
    "website" "text",
    "last_seen_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "education" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "projects" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "achievements" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL
);


--
-- Name: qr_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."qr_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "code" character varying(6) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "used_at" timestamp with time zone,
    "used_by_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "reporter_id" "uuid" NOT NULL,
    "assigned_to_id" "uuid",
    "resource_type" "public"."report_resource_type" NOT NULL,
    "resource_id" "uuid" NOT NULL,
    "reason" character varying(160) NOT NULL,
    "details" character varying(1000),
    "status" "public"."report_status" DEFAULT 'pending'::"public"."report_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: study_session_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."study_session_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" "public"."study_session_event_type" NOT NULL,
    "focused_seconds" integer NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "study_session_events_focused_seconds_check" CHECK (("focused_seconds" >= 0))
);


--
-- Name: study_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."study_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "course_id" "uuid",
    "task_id" "uuid",
    "client_request_id" "uuid" NOT NULL,
    "method" "public"."study_method" NOT NULL,
    "status" "public"."study_session_status" DEFAULT 'active'::"public"."study_session_status" NOT NULL,
    "planned_duration_seconds" integer NOT NULL,
    "break_duration_seconds" integer DEFAULT 0 NOT NULL,
    "focused_seconds" integer DEFAULT 0 NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "active_started_at" timestamp with time zone DEFAULT "now"(),
    "last_heartbeat_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paused_at" timestamp with time zone,
    "ended_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "study_sessions_break_duration_check" CHECK ((("break_duration_seconds" >= 0) AND ("break_duration_seconds" <= 7200))),
    CONSTRAINT "study_sessions_focused_seconds_check" CHECK (("focused_seconds" >= 0)),
    CONSTRAINT "study_sessions_planned_duration_check" CHECK (((("method" = 'flowtime'::"public"."study_method") AND ("planned_duration_seconds" = 0)) OR (("method" <> 'flowtime'::"public"."study_method") AND (("planned_duration_seconds" >= 60) AND ("planned_duration_seconds" <= 43200))))),
    CONSTRAINT "study_sessions_state_timestamps_check" CHECK (((("status" = 'active'::"public"."study_session_status") AND ("active_started_at" IS NOT NULL) AND ("paused_at" IS NULL) AND ("ended_at" IS NULL)) OR (("status" = 'paused'::"public"."study_session_status") AND ("active_started_at" IS NULL) AND ("paused_at" IS NOT NULL) AND ("ended_at" IS NULL)) OR (("status" = ANY (ARRAY['completed'::"public"."study_session_status", 'cancelled'::"public"."study_session_status"])) AND ("active_started_at" IS NULL) AND ("paused_at" IS NULL) AND ("ended_at" IS NOT NULL))))
);


--
-- Name: support_request_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."support_request_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "type" "public"."support_request_event_type" NOT NULL,
    "from_status" "public"."support_request_status",
    "to_status" "public"."support_request_status" NOT NULL,
    "note" character varying(1000),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "support_request_events_note_length_check" CHECK ((("note" IS NULL) OR (("char_length"("btrim"(("note")::"text")) >= 3) AND ("char_length"("btrim"(("note")::"text")) <= 1000)))),
    CONSTRAINT "support_request_events_shape_check" CHECK (((("type" = 'created'::"public"."support_request_event_type") AND ("from_status" IS NULL)) OR (("type" = 'status_changed'::"public"."support_request_event_type") AND ("from_status" IS NOT NULL) AND ("from_status" <> "to_status")) OR (("type" = 'response'::"public"."support_request_event_type") AND ("from_status" IS NULL) AND ("note" IS NOT NULL))))
);


--
-- Name: support_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."support_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_id" "uuid" NOT NULL,
    "assigned_to_id" "uuid",
    "source_message_id" "uuid",
    "category" "public"."support_request_category" NOT NULL,
    "subject" character varying(160) NOT NULL,
    "description" character varying(2000) NOT NULL,
    "desired_outcome" character varying(1000) NOT NULL,
    "urgency" "public"."support_request_urgency" DEFAULT 'medium'::"public"."support_request_urgency" NOT NULL,
    "status" "public"."support_request_status" DEFAULT 'pending'::"public"."support_request_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "created_by_id" "uuid" NOT NULL,
    "assigned_to_id" "uuid" NOT NULL,
    "title" character varying(160) NOT NULL,
    "description" character varying(1000),
    "due_date" "date",
    "priority" "public"."task_priority" DEFAULT 'medium'::"public"."task_priority" NOT NULL,
    "status" "public"."task_status" DEFAULT 'pending'::"public"."task_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: uploaded_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."uploaded_files" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "stored_name" character varying(255) NOT NULL,
    "original_name" character varying(255) NOT NULL,
    "mime_type" character varying(100) NOT NULL,
    "size" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."user_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "token_hash" character varying(64) NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE "public"."users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" character varying(320) NOT NULL,
    "password_hash" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'student'::"public"."user_role" NOT NULL,
    "status" "public"."user_status" DEFAULT 'active'::"public"."user_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY "drizzle"."__drizzle_migrations" ALTER COLUMN "id" SET DEFAULT "nextval"('"drizzle"."__drizzle_migrations_id_seq"'::"regclass");


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: drizzle; Owner: -
--

ALTER TABLE ONLY "drizzle"."__drizzle_migrations"
    ADD CONSTRAINT "__drizzle_migrations_pkey" PRIMARY KEY ("id");


--
-- Name: academic_calendar_events academic_calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_calendar_events"
    ADD CONSTRAINT "academic_calendar_events_pkey" PRIMARY KEY ("id");


--
-- Name: academic_calendar_syncs academic_calendar_syncs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_calendar_syncs"
    ADD CONSTRAINT "academic_calendar_syncs_pkey" PRIMARY KEY ("user_id");


--
-- Name: academic_courses academic_courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_courses"
    ADD CONSTRAINT "academic_courses_pkey" PRIMARY KEY ("id");


--
-- Name: academic_tasks academic_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_tasks"
    ADD CONSTRAINT "academic_tasks_pkey" PRIMARY KEY ("id");


--
-- Name: assistant_messages assistant_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."assistant_messages"
    ADD CONSTRAINT "assistant_messages_pkey" PRIMARY KEY ("id");


--
-- Name: ava_dom_imports ava_dom_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ava_dom_imports"
    ADD CONSTRAINT "ava_dom_imports_pkey" PRIMARY KEY ("id");


--
-- Name: chat_participants chat_participants_chat_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_user_id_pk" PRIMARY KEY ("chat_id", "user_id");


--
-- Name: chat_reads chat_reads_chat_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_reads"
    ADD CONSTRAINT "chat_reads_chat_id_user_id_pk" PRIMARY KEY ("chat_id", "user_id");


--
-- Name: chats chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");


--
-- Name: connection_intents connection_intents_requester_id_recipient_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."connection_intents"
    ADD CONSTRAINT "connection_intents_requester_id_recipient_id_pk" PRIMARY KEY ("requester_id", "recipient_id");


--
-- Name: connections connections_user_one_id_user_two_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_user_one_id_user_two_id_pk" PRIMARY KEY ("user_one_id", "user_two_id");


--
-- Name: duco_drafts duco_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duco_drafts"
    ADD CONSTRAINT "duco_drafts_pkey" PRIMARY KEY ("id");


--
-- Name: message_receipts message_receipts_message_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_message_id_user_id_pk" PRIMARY KEY ("message_id", "user_id");


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: poll_options poll_options_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_options"
    ADD CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id");


--
-- Name: poll_votes poll_votes_poll_id_option_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_poll_id_option_id_user_id_pk" PRIMARY KEY ("poll_id", "option_id", "user_id");


--
-- Name: polls polls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_pkey" PRIMARY KEY ("id");


--
-- Name: post_likes post_likes_post_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY ("post_id", "user_id");


--
-- Name: posts posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");


--
-- Name: qr_codes qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qr_codes"
    ADD CONSTRAINT "qr_codes_pkey" PRIMARY KEY ("id");


--
-- Name: reports reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_pkey" PRIMARY KEY ("id");


--
-- Name: study_session_events study_session_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."study_session_events"
    ADD CONSTRAINT "study_session_events_pkey" PRIMARY KEY ("id");


--
-- Name: study_sessions study_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: support_request_events support_request_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_request_events"
    ADD CONSTRAINT "support_request_events_pkey" PRIMARY KEY ("id");


--
-- Name: support_requests support_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_requests"
    ADD CONSTRAINT "support_requests_pkey" PRIMARY KEY ("id");


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");


--
-- Name: uploaded_files uploaded_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."uploaded_files"
    ADD CONSTRAINT "uploaded_files_pkey" PRIMARY KEY ("id");


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id");


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");


--
-- Name: academic_calendar_events_user_external_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "academic_calendar_events_user_external_unique" ON "public"."academic_calendar_events" USING "btree" ("user_id", "external_id");


--
-- Name: academic_calendar_events_user_start_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "academic_calendar_events_user_start_index" ON "public"."academic_calendar_events" USING "btree" ("user_id", "starts_at");


--
-- Name: academic_courses_user_active_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "academic_courses_user_active_index" ON "public"."academic_courses" USING "btree" ("user_id", "active");


--
-- Name: academic_courses_user_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "academic_courses_user_name_unique" ON "public"."academic_courses" USING "btree" ("user_id", "normalized_name");


--
-- Name: academic_tasks_course_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "academic_tasks_course_index" ON "public"."academic_tasks" USING "btree" ("course_id");


--
-- Name: academic_tasks_user_external_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "academic_tasks_user_external_unique" ON "public"."academic_tasks" USING "btree" ("user_id", "external_source", "external_id") WHERE (("external_source" IS NOT NULL) AND ("external_id" IS NOT NULL));


--
-- Name: academic_tasks_user_status_due_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "academic_tasks_user_status_due_index" ON "public"."academic_tasks" USING "btree" ("user_id", "status", "due_at");


--
-- Name: assistant_messages_user_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "assistant_messages_user_created_at_index" ON "public"."assistant_messages" USING "btree" ("user_id", "created_at");


--
-- Name: ava_dom_imports_expiry_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ava_dom_imports_expiry_index" ON "public"."ava_dom_imports" USING "btree" ("expires_at");


--
-- Name: ava_dom_imports_user_created_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ava_dom_imports_user_created_index" ON "public"."ava_dom_imports" USING "btree" ("user_id", "created_at");


--
-- Name: ava_dom_imports_user_digest_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ava_dom_imports_user_digest_unique" ON "public"."ava_dom_imports" USING "btree" ("user_id", "payload_digest");


--
-- Name: chat_participants_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chat_participants_user_id_index" ON "public"."chat_participants" USING "btree" ("user_id");


--
-- Name: chats_direct_key_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "chats_direct_key_unique" ON "public"."chats" USING "btree" ("direct_key");


--
-- Name: chats_updated_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "chats_updated_at_index" ON "public"."chats" USING "btree" ("updated_at");


--
-- Name: comments_parent_comment_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "comments_parent_comment_id_index" ON "public"."comments" USING "btree" ("parent_comment_id");


--
-- Name: comments_post_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "comments_post_created_at_index" ON "public"."comments" USING "btree" ("post_id", "created_at");


--
-- Name: connection_intents_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connection_intents_expires_at_index" ON "public"."connection_intents" USING "btree" ("expires_at");


--
-- Name: connection_intents_recipient_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connection_intents_recipient_index" ON "public"."connection_intents" USING "btree" ("recipient_id");


--
-- Name: connections_user_two_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "connections_user_two_id_index" ON "public"."connections" USING "btree" ("user_two_id");


--
-- Name: duco_drafts_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "duco_drafts_expires_at_index" ON "public"."duco_drafts" USING "btree" ("expires_at");


--
-- Name: duco_drafts_source_message_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "duco_drafts_source_message_unique" ON "public"."duco_drafts" USING "btree" ("source_message_id") WHERE ("source_message_id" IS NOT NULL);


--
-- Name: duco_drafts_user_status_updated_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "duco_drafts_user_status_updated_at_index" ON "public"."duco_drafts" USING "btree" ("user_id", "status", "updated_at");


--
-- Name: message_receipts_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "message_receipts_user_id_index" ON "public"."message_receipts" USING "btree" ("user_id");


--
-- Name: messages_chat_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_chat_created_at_index" ON "public"."messages" USING "btree" ("chat_id", "created_at");


--
-- Name: messages_sender_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "messages_sender_id_index" ON "public"."messages" USING "btree" ("sender_id");


--
-- Name: notifications_user_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_user_created_at_index" ON "public"."notifications" USING "btree" ("user_id", "created_at");


--
-- Name: poll_options_poll_position_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_options_poll_position_index" ON "public"."poll_options" USING "btree" ("poll_id", "position");


--
-- Name: poll_votes_poll_user_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "poll_votes_poll_user_index" ON "public"."poll_votes" USING "btree" ("poll_id", "user_id");


--
-- Name: polls_message_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "polls_message_id_unique" ON "public"."polls" USING "btree" ("message_id");


--
-- Name: posts_author_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "posts_author_created_at_index" ON "public"."posts" USING "btree" ("author_id", "created_at");


--
-- Name: posts_feed_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "posts_feed_index" ON "public"."posts" USING "btree" ("moderation_status", "visibility", "created_at");


--
-- Name: profiles_username_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "profiles_username_unique" ON "public"."profiles" USING "btree" ("username");


--
-- Name: qr_codes_code_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "qr_codes_code_unique" ON "public"."qr_codes" USING "btree" ("code");


--
-- Name: qr_codes_owner_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "qr_codes_owner_expires_at_index" ON "public"."qr_codes" USING "btree" ("owner_id", "expires_at");


--
-- Name: reports_status_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reports_status_created_at_index" ON "public"."reports" USING "btree" ("status", "created_at");


--
-- Name: study_session_events_session_occurred_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "study_session_events_session_occurred_at_index" ON "public"."study_session_events" USING "btree" ("session_id", "occurred_at");


--
-- Name: study_session_events_user_occurred_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "study_session_events_user_occurred_at_index" ON "public"."study_session_events" USING "btree" ("user_id", "occurred_at");


--
-- Name: study_sessions_course_started_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "study_sessions_course_started_at_index" ON "public"."study_sessions" USING "btree" ("course_id", "started_at");


--
-- Name: study_sessions_one_current_per_user_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "study_sessions_one_current_per_user_unique" ON "public"."study_sessions" USING "btree" ("user_id") WHERE ("status" = ANY (ARRAY['active'::"public"."study_session_status", 'paused'::"public"."study_session_status"]));


--
-- Name: study_sessions_user_client_request_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "study_sessions_user_client_request_unique" ON "public"."study_sessions" USING "btree" ("user_id", "client_request_id");


--
-- Name: study_sessions_user_started_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "study_sessions_user_started_at_index" ON "public"."study_sessions" USING "btree" ("user_id", "started_at");


--
-- Name: support_request_events_actor_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_request_events_actor_created_at_index" ON "public"."support_request_events" USING "btree" ("actor_id", "created_at");


--
-- Name: support_request_events_request_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_request_events_request_created_at_index" ON "public"."support_request_events" USING "btree" ("request_id", "created_at");


--
-- Name: support_requests_requester_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_requests_requester_created_at_index" ON "public"."support_requests" USING "btree" ("requester_id", "created_at");


--
-- Name: support_requests_source_message_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "support_requests_source_message_unique" ON "public"."support_requests" USING "btree" ("source_message_id");


--
-- Name: support_requests_status_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_requests_status_created_at_index" ON "public"."support_requests" USING "btree" ("status", "created_at");


--
-- Name: tasks_assigned_to_status_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_assigned_to_status_index" ON "public"."tasks" USING "btree" ("assigned_to_id", "status");


--
-- Name: tasks_chat_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tasks_chat_created_at_index" ON "public"."tasks" USING "btree" ("chat_id", "created_at");


--
-- Name: uploaded_files_owner_created_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "uploaded_files_owner_created_at_index" ON "public"."uploaded_files" USING "btree" ("owner_id", "created_at");


--
-- Name: uploaded_files_stored_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "uploaded_files_stored_name_unique" ON "public"."uploaded_files" USING "btree" ("stored_name");


--
-- Name: user_sessions_expires_at_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_sessions_expires_at_index" ON "public"."user_sessions" USING "btree" ("expires_at");


--
-- Name: user_sessions_token_hash_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "user_sessions_token_hash_unique" ON "public"."user_sessions" USING "btree" ("token_hash");


--
-- Name: user_sessions_user_id_index; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "user_sessions_user_id_index" ON "public"."user_sessions" USING "btree" ("user_id");


--
-- Name: users_email_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "users_email_unique" ON "public"."users" USING "btree" ("email");


--
-- Name: academic_calendar_events academic_calendar_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_calendar_events"
    ADD CONSTRAINT "academic_calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: academic_calendar_syncs academic_calendar_syncs_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_calendar_syncs"
    ADD CONSTRAINT "academic_calendar_syncs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: academic_courses academic_courses_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_courses"
    ADD CONSTRAINT "academic_courses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: academic_tasks academic_tasks_course_id_academic_courses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_tasks"
    ADD CONSTRAINT "academic_tasks_course_id_academic_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academic_courses"("id") ON DELETE SET NULL;


--
-- Name: academic_tasks academic_tasks_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."academic_tasks"
    ADD CONSTRAINT "academic_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: assistant_messages assistant_messages_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."assistant_messages"
    ADD CONSTRAINT "assistant_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: ava_dom_imports ava_dom_imports_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."ava_dom_imports"
    ADD CONSTRAINT "ava_dom_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: chat_participants chat_participants_chat_id_chats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;


--
-- Name: chat_participants chat_participants_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_participants"
    ADD CONSTRAINT "chat_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: chat_reads chat_reads_chat_id_chats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_reads"
    ADD CONSTRAINT "chat_reads_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;


--
-- Name: chat_reads chat_reads_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chat_reads"
    ADD CONSTRAINT "chat_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: chats chats_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: comments comments_author_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: comments comments_parent_comment_id_comments_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE CASCADE;


--
-- Name: comments comments_post_id_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."comments"
    ADD CONSTRAINT "comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;


--
-- Name: connection_intents connection_intents_recipient_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."connection_intents"
    ADD CONSTRAINT "connection_intents_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: connection_intents connection_intents_requester_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."connection_intents"
    ADD CONSTRAINT "connection_intents_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: connections connections_user_one_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_user_one_id_users_id_fk" FOREIGN KEY ("user_one_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: connections connections_user_two_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."connections"
    ADD CONSTRAINT "connections_user_two_id_users_id_fk" FOREIGN KEY ("user_two_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: duco_drafts duco_drafts_source_message_id_assistant_messages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duco_drafts"
    ADD CONSTRAINT "duco_drafts_source_message_id_assistant_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."assistant_messages"("id") ON DELETE SET NULL;


--
-- Name: duco_drafts duco_drafts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."duco_drafts"
    ADD CONSTRAINT "duco_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: message_receipts message_receipts_message_id_messages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;


--
-- Name: message_receipts message_receipts_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."message_receipts"
    ADD CONSTRAINT "message_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: messages messages_chat_id_chats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;


--
-- Name: messages messages_sender_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: notifications notifications_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: poll_options poll_options_poll_id_polls_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_options"
    ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_option_id_poll_options_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_poll_id_polls_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE CASCADE;


--
-- Name: poll_votes poll_votes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."poll_votes"
    ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: polls polls_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: polls polls_message_id_messages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."polls"
    ADD CONSTRAINT "polls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE CASCADE;


--
-- Name: post_likes post_likes_post_id_posts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE CASCADE;


--
-- Name: post_likes post_likes_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."post_likes"
    ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: posts posts_author_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."posts"
    ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: profiles profiles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: qr_codes qr_codes_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qr_codes"
    ADD CONSTRAINT "qr_codes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: qr_codes qr_codes_used_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."qr_codes"
    ADD CONSTRAINT "qr_codes_used_by_id_users_id_fk" FOREIGN KEY ("used_by_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: reports reports_assigned_to_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: reports reports_reporter_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."reports"
    ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: study_session_events study_session_events_session_id_study_sessions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."study_session_events"
    ADD CONSTRAINT "study_session_events_session_id_study_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."study_sessions"("id") ON DELETE CASCADE;


--
-- Name: study_session_events study_session_events_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."study_session_events"
    ADD CONSTRAINT "study_session_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: study_sessions study_sessions_course_id_academic_courses_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_course_id_academic_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."academic_courses"("id") ON DELETE SET NULL;


--
-- Name: study_sessions study_sessions_task_id_academic_tasks_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_task_id_academic_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."academic_tasks"("id") ON DELETE SET NULL;


--
-- Name: study_sessions study_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."study_sessions"
    ADD CONSTRAINT "study_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: support_request_events support_request_events_actor_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_request_events"
    ADD CONSTRAINT "support_request_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: support_request_events support_request_events_request_id_support_requests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_request_events"
    ADD CONSTRAINT "support_request_events_request_id_support_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."support_requests"("id") ON DELETE CASCADE;


--
-- Name: support_requests support_requests_assigned_to_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_requests"
    ADD CONSTRAINT "support_requests_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE SET NULL;


--
-- Name: support_requests support_requests_requester_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_requests"
    ADD CONSTRAINT "support_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: support_requests support_requests_source_message_id_assistant_messages_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."support_requests"
    ADD CONSTRAINT "support_requests_source_message_id_assistant_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."assistant_messages"("id") ON DELETE SET NULL;


--
-- Name: tasks tasks_assigned_to_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: tasks tasks_chat_id_chats_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE CASCADE;


--
-- Name: tasks tasks_created_by_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: uploaded_files uploaded_files_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."uploaded_files"
    ADD CONSTRAINT "uploaded_files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY "public"."user_sessions"
    ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict AeUvMNsXTfa7GY13DZ8IbdtIln1dcwFXJdvtF4LK3BUaP95IC3WV2wi8km2kZHH

