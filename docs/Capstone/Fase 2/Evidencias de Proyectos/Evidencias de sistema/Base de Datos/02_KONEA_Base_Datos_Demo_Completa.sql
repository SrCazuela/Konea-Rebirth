--
-- PostgreSQL database dump
--

\restrict bSBFypnryGLdGdITt5JYu3anJ2LlJlfvYfi0WumTNRSyTn5zJKyN5o7mvEqp2ae

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
-- Data for Name: __drizzle_migrations; Type: TABLE DATA; Schema: drizzle; Owner: -
--

COPY "drizzle"."__drizzle_migrations" ("id", "hash", "created_at") FROM stdin;
1	547dc61fc8595448fb34e51dc1013c231d784aac4a1af802cca9bb394fb8004e	1787091939621
2	5a8cf6201b890d778e07e97aa180bdd7b5ba7f51b6ae898c67a1945d4a0f1b03	1787096877543
3	90a642268a99e72fd6ffdd9d21fa554913284fe8e79df5f22df2008ea60d8c5e	1787105871660
4	98a971ddbdfa3cb89c15fb16acaf35475eb824cef302843a6cc22ffb301fb41b	1787109358117
5	2e32b8293eadcfb7512df105b93b37310b7bb7703be17349ef92272d393cf07c	1787567152064
6	982cec5f840cbadf4aed44c381c1154ecbf350ac9a7cdf4fef23d6dfd7b9f57d	1787569305818
7	23e0e2c26d19c5e1878ab7d0ee7c68ae8f597fea4c5bffb7a84007d9d5167a21	1787652767787
8	5531fea8f1aa75349e919487f05609f8ecb318ce4f8d799dcee1e885e4d8ce05	1787654978283
9	7291bc4890d34c32de495f28b606cc59b49ad4c0015871ee591b6b0c78f81583	1787711236947
10	10148f5579d38d61384d76e411ebea925ff7f927baf32ce9c68e29854d914933	1788321342880
11	dd3692912a79415c46f4c7cd6ae3f7e20ad70db51dd3630c4964df41a339d7b6	1788841158369
12	561f5dc0759389d0b93dd14c799860f4b5491a1c0e099500034da04039d53944	1788842834004
13	b3c7eecd71f041381f5b0bc6a53dd80e0319ba328ddd141807bbc363a7b7c01c	1790151008745
\.


--
-- Data for Name: academic_calendar_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."academic_calendar_events" ("id", "user_id", "external_id", "uid", "title", "description", "location", "course_name", "starts_at", "ends_at", "all_day", "active", "last_synced_at", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: academic_calendar_syncs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."academic_calendar_syncs" ("user_id", "last_synced_at", "last_event_count", "updated_at") FROM stdin;
\.


--
-- Data for Name: academic_courses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."academic_courses" ("id", "user_id", "name", "normalized_name", "code", "section", "term", "source", "active", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: academic_tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."academic_tasks" ("id", "user_id", "course_id", "title", "description", "due_at", "priority", "status", "created_at", "updated_at", "external_source", "external_id") FROM stdin;
\.


--
-- Data for Name: assistant_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."assistant_messages" ("id", "user_id", "role", "content", "created_at", "action") FROM stdin;
\.


--
-- Data for Name: ava_dom_imports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."ava_dom_imports" ("id", "user_id", "payload_digest", "payload", "status", "result", "expires_at", "confirmed_at", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: chat_participants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."chat_participants" ("chat_id", "user_id", "role", "joined_at", "archived_at") FROM stdin;
\.


--
-- Data for Name: chat_reads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."chat_reads" ("chat_id", "user_id", "last_read_at") FROM stdin;
\.


--
-- Data for Name: chats; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."chats" ("id", "type", "direct_key", "name", "avatar_url", "created_by_id", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."comments" ("id", "post_id", "author_id", "content", "created_at", "updated_at", "parent_comment_id") FROM stdin;
d4000000-0000-4000-8000-000000000001	d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000002	Ese gato hizo un push directo a main.	2026-10-05 23:25:03.062+00	2026-10-05 23:25:03.062+00	\N
d4000000-0000-4000-8000-000000000002	d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000001	Sin tests y con una seguridad envidiable.	2026-10-05 23:34:03.062+00	2026-10-05 23:34:03.062+00	d4000000-0000-4000-8000-000000000001
d4000000-0000-4000-8000-000000000003	d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000008	Perfil senior, claramente.	2026-10-05 23:49:03.062+00	2026-10-05 23:49:03.062+00	\N
d4000000-0000-4000-8000-000000000004	d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000001	Tengo un resumen por temas. Lo puedo llevar mañana a biblioteca.	2026-10-05 18:31:03.062+00	2026-10-05 18:31:03.062+00	\N
d4000000-0000-4000-8000-000000000005	d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000005	Me sumo si hacen grupo. A mí me sirve resolver ejercicios cortos y explicar el procedimiento.	2026-10-05 18:48:03.062+00	2026-10-05 18:48:03.062+00	\N
d4000000-0000-4000-8000-000000000006	d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000002	Buena, les escribo para coordinarnos sin llenar el post de horarios.	2026-10-05 19:02:03.062+00	2026-10-05 19:02:03.062+00	d4000000-0000-4000-8000-000000000005
d4000000-0000-4000-8000-000000000007	d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000010	Grande por dejarla en portería y no publicar los datos.	2026-10-05 13:37:03.062+00	2026-10-05 13:37:03.062+00	\N
d4000000-0000-4000-8000-000000000008	d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000011	Compartido al grupo de la sede, ojalá aparezca la persona.	2026-10-05 13:55:03.062+00	2026-10-05 13:55:03.062+00	\N
d4000000-0000-4000-8000-000000000009	d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000005	Coordinarse también es una habilidad, pero estoy de acuerdo con que la nota individual debería pesar más.	2026-10-05 06:32:03.062+00	2026-10-05 06:32:03.062+00	\N
d4000000-0000-4000-8000-000000000010	d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000012	Si cada persona cumple su parte, el horario deja de ser el problema.	2026-10-05 06:51:03.062+00	2026-10-05 06:51:03.062+00	\N
d4000000-0000-4000-8000-000000000011	d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000006	A veces hay dependencias entre tareas. Por eso una pauta más transparente ayudaría a todos.	2026-10-05 07:08:03.062+00	2026-10-05 07:08:03.062+00	d4000000-0000-4000-8000-000000000010
d4000000-0000-4000-8000-000000000012	d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000009	La coevaluación bien diseñada salva bastante, siempre que no sea solo poner una nota al final.	2026-10-05 07:26:03.062+00	2026-10-05 07:26:03.062+00	\N
d4000000-0000-4000-8000-000000000013	d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000011	La máquina del segundo piso gana por consistencia, no necesariamente por sabor.	2026-10-04 20:23:03.062+00	2026-10-04 20:23:03.062+00	\N
d4000000-0000-4000-8000-000000000014	d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000004	Acepto el criterio, pero eso suena a agua con intención de café.	2026-10-04 20:30:03.062+00	2026-10-04 20:30:03.062+00	d4000000-0000-4000-8000-000000000013
d4000000-0000-4000-8000-000000000015	d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000010	El de termo traído desde la casa supera a todos y cuesta menos.	2026-10-04 21:04:03.062+00	2026-10-04 21:04:03.062+00	\N
d4000000-0000-4000-8000-000000000016	d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000009	Me interesa. ¿Tienen una referencia del estilo visual?	2026-10-04 10:42:03.062+00	2026-10-04 10:42:03.062+00	\N
d4000000-0000-4000-8000-000000000017	d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000010	¿En qué horario sería? Podría después de mi práctica.	2026-10-04 11:01:03.062+00	2026-10-04 11:01:03.062+00	\N
d4000000-0000-4000-8000-000000000018	d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000007	Entre 15:00 y 18:00. Te mando la pauta por interno.	2026-10-04 11:13:03.062+00	2026-10-04 11:13:03.062+00	d4000000-0000-4000-8000-000000000017
d4000000-0000-4000-8000-000000000019	d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000001	Acá también falló. Cambiamos el cable y volvió por unos minutos.	2026-10-04 00:19:03.062+00	2026-10-04 00:19:03.062+00	\N
d4000000-0000-4000-8000-000000000020	d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000008	Entonces no era solo mi equipo, gracias por confirmar.	2026-10-04 00:26:03.062+00	2026-10-04 00:26:03.062+00	d4000000-0000-4000-8000-000000000019
d4000000-0000-4000-8000-000000000021	d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000002	El laboratorio ya lo reportó a soporte, dijeron que lo estaban revisando.	2026-10-04 00:45:03.062+00	2026-10-04 00:45:03.062+00	\N
d4000000-0000-4000-8000-000000000022	d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000003	Yo abriría con el proyecto que mejor explica tu proceso. Después muestras la pieza más pulida.	2026-10-03 14:38:03.062+00	2026-10-03 14:38:03.062+00	\N
d4000000-0000-4000-8000-000000000023	d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000009	Tiene sentido: contexto, proceso y luego resultado. Gracias.	2026-10-03 14:54:03.062+00	2026-10-03 14:54:03.062+00	d4000000-0000-4000-8000-000000000022
d4000000-0000-4000-8000-000000000024	d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000005	Felicitaciones por la primera semana. Descansar también es parte del plan.	2026-10-03 02:35:03.062+00	2026-10-03 02:35:03.062+00	\N
d4000000-0000-4000-8000-000000000025	d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000010	Aprendido a la fuerza, pero aprendido jajaja.	2026-10-03 02:46:03.062+00	2026-10-03 02:46:03.062+00	d4000000-0000-4000-8000-000000000024
d4000000-0000-4000-8000-000000000026	d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000012	Técnicamente avisó que comprobaría conocimientos.	2026-10-02 13:21:03.062+00	2026-10-02 13:21:03.062+00	\N
d4000000-0000-4000-8000-000000000027	d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000011	La letra chica académica nunca falla.	2026-10-02 13:28:03.062+00	2026-10-02 13:28:03.062+00	d4000000-0000-4000-8000-000000000026
d4000000-0000-4000-8000-000000000028	d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000001	O quizá el alcance estaba mal estimado. Sin contexto es difícil culpar al grupo completo.	2026-10-01 22:27:03.062+00	2026-10-01 22:27:03.062+00	\N
d4000000-0000-4000-8000-000000000029	d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000012	Puede ser. En este caso cambiaron el tema dos veces, así que contexto sí faltaba.	2026-10-01 22:41:03.062+00	2026-10-01 22:41:03.062+00	d4000000-0000-4000-8000-000000000028
d4000000-0000-4000-8000-000000000030	d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000005	Planificar ayuda, pero avisar a tiempo cuando algo se bloquea ayuda todavía más.	2026-10-01 22:56:03.062+00	2026-10-01 22:56:03.062+00	\N
d4000000-0000-4000-8000-000000000031	d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000002	La conclusión oficial es que necesitamos retrospectiva y menos indirectas.	2026-10-01 23:11:03.062+00	2026-10-01 23:11:03.062+00	\N
d4000000-0000-4000-8000-000000000032	d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000008	Apaño con PostgreSQL. Me falta practicar joins y transacciones.	2026-10-01 04:24:03.062+00	2026-10-01 04:24:03.062+00	\N
d4000000-0000-4000-8000-000000000033	d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000002	Voy. Puedo llevar ejercicios de Node que nos dejaron el semestre pasado.	2026-10-01 04:36:03.062+00	2026-10-01 04:36:03.062+00	\N
d4000000-0000-4000-8000-000000000034	d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000001	Perfecto, partimos por joins y después vemos transacciones con un ejemplo chico.	2026-10-01 04:45:03.062+00	2026-10-01 04:45:03.062+00	d4000000-0000-4000-8000-000000000032
d4000000-0000-4000-8000-000000000035	d3000000-0000-4000-8000-000000000013	d1000000-0000-4000-8000-000000000002	A mí me respondieron en cuatro días hábiles. Tener el borrador claro evitó que me pidieran lo mismo dos veces.	2026-09-30 06:29:03.062+00	2026-09-30 06:29:03.062+00	\N
d4000000-0000-4000-8000-000000000036	d3000000-0000-4000-8000-000000000013	d1000000-0000-4000-8000-000000000005	Buen dato, entonces adjunto todo desde el primer envío.	2026-09-30 06:43:03.062+00	2026-09-30 06:43:03.062+00	d4000000-0000-4000-8000-000000000035
d4000000-0000-4000-8000-000000000037	d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000008	Me anoto. Prometo no culpar al control si quedo último.	2026-09-29 05:27:03.062+00	2026-09-29 05:27:03.062+00	\N
d4000000-0000-4000-8000-000000000038	d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000003	¿Aceptan gente que todavía confunde freno con derrape?	2026-09-29 05:49:03.062+00	2026-09-29 05:49:03.062+00	\N
d4000000-0000-4000-8000-000000000039	d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000004	Ese es exactamente el espíritu del torneo.	2026-09-29 05:57:03.062+00	2026-09-29 05:57:03.062+00	d4000000-0000-4000-8000-000000000038
d4000000-0000-4000-8000-000000000040	d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000010	Confirmo. Una chaqueta impermeable vale más que cualquier técnica de estudio en esos días.	2026-09-28 04:32:03.062+00	2026-09-28 04:32:03.062+00	\N
d4000000-0000-4000-8000-000000000041	d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000006	Y una bolsa para proteger el cuaderno. Lección aprendida.	2026-09-28 04:44:03.062+00	2026-09-28 04:44:03.062+00	d4000000-0000-4000-8000-000000000040
\.


--
-- Data for Name: connection_intents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."connection_intents" ("requester_id", "recipient_id", "created_at", "expires_at") FROM stdin;
\.


--
-- Data for Name: connections; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."connections" ("user_one_id", "user_two_id", "created_at") FROM stdin;
\.


--
-- Data for Name: duco_drafts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."duco_drafts" ("id", "user_id", "kind", "status", "payload", "source_message_id", "completed_resource_id", "expires_at", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: message_receipts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."message_receipts" ("message_id", "user_id", "delivered_at", "read_at") FROM stdin;
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."messages" ("id", "chat_id", "sender_id", "content", "type", "file_url", "file_name", "file_size", "tags", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."notifications" ("id", "user_id", "actor_id", "type", "title", "body", "href", "resource_id", "read_at", "created_at") FROM stdin;
\.


--
-- Data for Name: poll_options; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."poll_options" ("id", "poll_id", "label", "position") FROM stdin;
\.


--
-- Data for Name: poll_votes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."poll_votes" ("poll_id", "option_id", "user_id", "created_at") FROM stdin;
\.


--
-- Data for Name: polls; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."polls" ("id", "message_id", "created_by_id", "question", "allow_multiple", "created_at") FROM stdin;
\.


--
-- Data for Name: post_likes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."post_likes" ("post_id", "user_id", "created_at") FROM stdin;
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000013	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000013	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000013	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000013	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000016	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000016	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000016	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000016	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000016	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000016	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000016	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000017	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000017	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000017	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000017	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000017	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000017	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000009	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000020	d1000000-0000-4000-8000-000000000010	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000020	d1000000-0000-4000-8000-000000000011	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000020	d1000000-0000-4000-8000-000000000012	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000020	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000020	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000020	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000020	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000021	d1000000-0000-4000-8000-000000000001	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000021	d1000000-0000-4000-8000-000000000002	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000021	d1000000-0000-4000-8000-000000000003	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000021	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000021	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000021	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000022	d1000000-0000-4000-8000-000000000004	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000022	d1000000-0000-4000-8000-000000000005	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000022	d1000000-0000-4000-8000-000000000006	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000022	d1000000-0000-4000-8000-000000000007	2026-10-06 02:07:03.062+00
d3000000-0000-4000-8000-000000000022	d1000000-0000-4000-8000-000000000008	2026-10-06 02:07:03.062+00
\.


--
-- Data for Name: posts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."posts" ("id", "author_id", "content", "image_url", "visibility", "moderation_status", "moderation_reason", "created_at", "updated_at", "content_type", "share_count") FROM stdin;
d3000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000001	Mi ayudante de Capstone decidió dormir sobre el notebook justo cuando iba a hacer push. ¿Esto cuenta como revisión de código? 🐈💻	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000009.jpg	campus	approved	\N	2026-10-05 23:07:03.062+00	2026-10-05 23:07:03.062+00	community	2
d3000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000002	¿Alguien tiene un método que le haya servido para estudiar Fundamentos de Matemáticas sin memorizar todo a última hora? Tengo prueba el viernes y quiero organizarme bien.	\N	campus	approved	\N	2026-10-05 18:07:03.062+00	2026-10-05 18:07:03.062+00	community	1
d3000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000005	Encontré una tarjeta Bip! con una cinta morada afuera de la biblioteca. La dejé en portería indicando la hora y el lugar por si es de alguien de acá.	\N	campus	approved	\N	2026-10-05 13:07:03.062+00	2026-10-05 13:07:03.062+00	community	3
d3000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000006	Opinión impopular: muchos trabajos grupales terminan evaluando disponibilidad de horario más que aprendizaje. La pauta debería separar mejor el aporte individual. Los leo 👀	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000011.jpg	campus	approved	\N	2026-10-05 06:07:03.062+00	2026-10-05 06:07:03.062+00	community	3
d3000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000004	Ranking completamente científico del café de sede: máquina del segundo piso > cafetería del patio > el que preparo apurado antes de salir. Acepto evidencia en contra.	\N	campus	approved	\N	2026-10-04 20:07:03.062+00	2026-10-04 20:07:03.062+00	community	1
d3000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000007	Buscamos dos personas para actuar en un cortometraje estudiantil este sábado en Viña. No se necesita experiencia; sí puntualidad y ganas de participar. Si les interesa, comenten y les envío los detalles.	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000012.jpg	public	approved	\N	2026-10-04 10:07:03.062+00	2026-10-04 10:07:03.062+00	community	4
d3000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000008	¿A alguien más se le cayó la conexión del laboratorio 302 o mi computador decidió iniciar el fin de semana antes que yo?	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000010.jpg	campus	approved	\N	2026-10-04 00:07:03.062+00	2026-10-04 00:07:03.062+00	community	0
d3000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000009	Estoy ordenando mi portafolio y no sé si abrir con el proyecto más completo o con el que tiene mejor historia visual. ¿Qué miran primero cuando revisan uno?	\N	public	approved	\N	2026-10-03 14:07:03.062+00	2026-10-03 14:07:03.062+00	community	1
d3000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000010	Primera semana de práctica completada. Aprendí muchísimo, anoté todo y ahora entiendo por qué el descanso también forma parte de organizarse 😴	\N	campus	approved	\N	2026-10-03 02:07:03.062+00	2026-10-03 02:07:03.062+00	community	0
d3000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000011	El profesor dijo “es una actividad corta para comprobar conocimientos” y apareció un quiz de 18 preguntas. El marketing de expectativas estuvo impecable.	\N	campus	approved	\N	2026-10-02 13:07:03.062+00	2026-10-02 13:07:03.062+00	community	2
d3000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000012	Si un grupo tuvo tres semanas y entrega tarde, quizá el problema no era el plazo. Digo nomás.	\N	campus	approved	\N	2026-10-01 22:07:03.062+00	2026-10-01 22:07:03.062+00	community	2
d3000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000001	Voy a estar mañana en biblioteca repasando Node y PostgreSQL desde las 16:00. Si alguien quiere sumarse a resolver dudas y comparar apuntes, apaño.	\N	campus	approved	\N	2026-10-01 04:07:03.062+00	2026-10-01 04:07:03.062+00	community	2
d3000000-0000-4000-8000-000000000013	d1000000-0000-4000-8000-000000000005	¿Alguien ha gestionado un cambio de sección este semestre? DUCO me ayudó a ordenar los antecedentes y preparar el borrador, pero quisiera saber cuánto demoró la respuesta.	\N	campus	approved	\N	2026-09-30 06:07:03.062+00	2026-09-30 06:07:03.062+00	community	1
d3000000-0000-4000-8000-000000000014	d1000000-0000-4000-8000-000000000004	Estamos armando torneo amistoso de juegos de carrera para el viernes después de clases. La idea es desconectarse un rato; principiantes totalmente bienvenidos.	\N	public	approved	\N	2026-09-29 05:07:03.062+00	2026-09-29 05:07:03.062+00	community	3
d3000000-0000-4000-8000-000000000015	d1000000-0000-4000-8000-000000000006	Recordatorio amistoso para quienes cruzan media ciudad: revisen el pronóstico y salgan con tiempo. Hoy llegamos cinco personas empapadas a la misma prueba.	\N	campus	approved	\N	2026-09-28 04:07:03.062+00	2026-09-28 04:07:03.062+00	community	2
d3000000-0000-4000-8000-000000000016	d1000000-0000-4000-8000-000000000013	AVISO VIGENTE · Calendario académico 2026 · Revisa las fechas académicas y confirma siempre posibles actualizaciones directamente en el sitio oficial de Duoc UC.\n\nFuente oficial: https://www.duoc.cl/calendario-academico/	\N	public	approved	\N	2026-09-22 12:00:00+00	2026-09-22 12:00:00+00	announcement	4
d3000000-0000-4000-8000-000000000017	d1000000-0000-4000-8000-000000000013	NOTICIA · 16-09-2026 · Una especialista de Duoc UC participó en una jornada nacional sobre seguridad del paciente. Este post es un resumen demostrativo; consulta la nota original para conocer el contexto completo.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=especialista-de-duoc-uc-participa-en-jornada-nacional-sobre-seguridad-del-paciente	\N	public	approved	\N	2026-09-16 16:00:00+00	2026-09-16 16:00:00+00	announcement	2
d3000000-0000-4000-8000-000000000018	d1000000-0000-4000-8000-000000000013	NOTICIA · 09-09-2026 · Estudiantes de Duoc UC desarrollaron soluciones para el desafío Marketing Challenge 2026. Revisa la publicación original para ver los detalles de la experiencia.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=estudiantes-de-duoc-uc-desarrollan-soluciones-para-desafio-de-marketing-challenge-2026	\N	public	approved	\N	2026-09-09 15:00:00+00	2026-09-09 15:00:00+00	announcement	3
d3000000-0000-4000-8000-000000000019	d1000000-0000-4000-8000-000000000013	NOTICIA · 09-09-2026 · Toyota Chile y Duoc UC impulsaron a una primera generación de mujeres que busca abrirse camino en la industria automotriz.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=toyota-chile-y-duoc-uc-impulsan-a-primera-generacion-de-mujeres-que-busca-abrirse-camino-en-la-industria-automotriz	\N	public	approved	\N	2026-09-09 14:00:00+00	2026-09-09 14:00:00+00	announcement	3
d3000000-0000-4000-8000-000000000020	d1000000-0000-4000-8000-000000000013	ARCHIVO · ACTIVIDAD FINALIZADA · 10-07-2026 · Estudiantes y titulados de Duoc UC ganaron el Pitch Indie 2026 de Chilemonos con “La aprendiz de bruja”.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=estudiantes-y-titulados-duoc-uc-ganan-el-pitch-indie-2026-de-chilemonos-conla-aprendiz-de-bruja	\N	public	approved	\N	2026-07-10 16:00:00+00	2026-07-10 16:00:00+00	announcement	2
d3000000-0000-4000-8000-000000000021	d1000000-0000-4000-8000-000000000013	ARCHIVO · ACTIVIDAD FINALIZADA · 02-12-2025 · Portfolio Night Santiago 2025 conectó a jóvenes talentos de Duoc UC con la industria creativa. Se conserva como referencia de actividades anteriores.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=portfolio-night-santiago-2025-jovenes-talentos-de-duoc-uc-se-conectan-con-la-industria-creativa	\N	public	approved	\N	2025-12-02 15:00:00+00	2025-12-02 15:00:00+00	announcement	1
d3000000-0000-4000-8000-000000000022	d1000000-0000-4000-8000-000000000013	ARCHIVO · ACTIVIDAD FINALIZADA · 16-09-2024 · La Feria Intercarreras fue una instancia para conectar a estudiantes con la industria. Esta publicación histórica se muestra como referencia.\n\nFuente oficial: https://www.duoc.cl/?noticia_post_type=feria-intercarreras-una-instancia-que-conecta-a-los-estudiantes-con-la-industria	\N	public	approved	\N	2024-09-16 15:00:00+00	2024-09-16 15:00:00+00	announcement	1
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."profiles" ("user_id", "username", "display_name", "bio", "institution", "career", "avatar_url", "created_at", "updated_at", "cover_url", "campus", "website", "last_seen_at", "education", "projects", "achievements") FROM stdin;
d1000000-0000-4000-8000-000000000001	vale.compila	Valentina Rojas	Convirtiendo café y errores de TypeScript en entregas que sí compilan.	Duoc UC	Ingeniería en Informática	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000009.jpg	2026-06-08 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede San Joaquín	\N	2026-10-06 02:07:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000001", "current": true, "endYear": null, "program": "Ingeniería en Informática", "startYear": 2024, "institution": "Duoc UC"}]	[{"id": "d6000000-0000-4000-8000-000000000001", "url": null, "title": "Mapa colaborativo de salas", "imageUrl": null, "description": "Prototipo móvil para ubicar laboratorios, salas y servicios dentro de la sede.", "technologies": ["React", "TypeScript", "PostgreSQL"], "repositoryUrl": null}]	[]
d1000000-0000-4000-8000-000000000002	mati.en.loop	Matías Soto	Programo, juego y vuelvo a programar hasta que desaparece el error.	Duoc UC	Analista Programador	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000007.png	2026-06-04 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Antonio Varas	\N	2026-10-06 01:44:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000002", "current": true, "endYear": null, "program": "Analista Programador", "startYear": 2024, "institution": "Duoc UC"}]	[]	[]
d1000000-0000-4000-8000-000000000003	fer.trazos	Fernanda Leiva	Ilustración, narrativa visual y demasiados pinceles sin nombre.	Duoc UC	Ilustración para Contextos Globales	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000005.png	2026-05-31 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Viña del Mar	\N	2026-10-06 01:21:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000003", "current": true, "endYear": null, "program": "Ilustración para Contextos Globales", "startYear": 2024, "institution": "Duoc UC"}]	[{"id": "d6000000-0000-4000-8000-000000000002", "url": null, "title": "Bestiario del transporte público", "imageUrl": null, "description": "Serie de personajes inspirados en trayectos cotidianos por Valparaíso y Viña del Mar.", "technologies": ["Procreate", "Photoshop"], "repositoryUrl": null}]	[]
d1000000-0000-4000-8000-000000000004	dieguito.wav	Diego Muñoz	Si suena raro, probablemente todavía estoy mezclándolo.	Duoc UC	Ingeniería en Sonido	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000008.png	2026-05-27 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede San Carlos de Apoquindo	\N	2026-10-06 00:58:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000004", "current": true, "endYear": null, "program": "Ingeniería en Sonido", "startYear": 2024, "institution": "Duoc UC"}]	[]	[]
d1000000-0000-4000-8000-000000000005	cami.logistica	Camila Herrera	Organizando rutas, inventarios y al grupo que responde cinco minutos antes.	Duoc UC	Ingeniería en Gestión Logística	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000002.jpg	2026-05-23 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Plaza Oeste	\N	2026-10-06 00:35:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000005", "current": true, "endYear": null, "program": "Ingeniería en Gestión Logística", "startYear": 2024, "institution": "Duoc UC"}]	[]	[{"id": "d7000000-0000-4000-8000-000000000001", "title": "Finalista desafío de mejora de procesos", "issuer": "Duoc UC", "issuedAt": "2026-06", "description": "Propuesta estudiantil para reducir tiempos de preparación.", "credentialUrl": null}]
d1000000-0000-4000-8000-000000000006	tomas.sin.cafe	Tomás Araya	Backend, bases de datos y opiniones probablemente demasiado largas.	Duoc UC	Ingeniería en Informática	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000011.jpg	2026-05-19 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Padre Alonso de Ovalle	\N	2026-10-06 00:12:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000006", "current": true, "endYear": null, "program": "Ingeniería en Informática", "startYear": 2024, "institution": "Duoc UC"}]	[]	[]
d1000000-0000-4000-8000-000000000007	anto.en.camara	Antonia Paredes	Dirección, montaje y planes de rodaje que sobreviven al clima.	Duoc UC	Comunicación Audiovisual	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000012.jpg	2026-05-15 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Viña del Mar	\N	2026-10-05 23:49:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000007", "current": true, "endYear": null, "program": "Comunicación Audiovisual", "startYear": 2024, "institution": "Duoc UC"}]	[{"id": "d6000000-0000-4000-8000-000000000003", "url": null, "title": "Último recorrido", "imageUrl": null, "description": "Cortometraje estudiantil sobre las historias que coinciden en el último bus de la noche.", "technologies": ["DaVinci Resolve", "Premiere Pro"], "repositoryUrl": null}]	[]
d1000000-0000-4000-8000-000000000008	benja.redes	Benjamín Vera	Redes, Linux y el cable que nadie quería revisar.	Duoc UC	Ingeniería en Redes y Telecomunicaciones	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000010.jpg	2026-05-11 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede San Joaquín	\N	2026-10-05 23:26:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000008", "current": true, "endYear": null, "program": "Ingeniería en Redes y Telecomunicaciones", "startYear": 2024, "institution": "Duoc UC"}]	[]	[]
d1000000-0000-4000-8000-000000000009	javi.disena	Javiera Salas	Diseño identidades, interfaces y presentaciones con una capa de más.	Duoc UC	Diseño Gráfico	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000006.jpg	2026-05-07 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Plaza Vespucio	\N	2026-10-05 23:03:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000009", "current": true, "endYear": null, "program": "Diseño Gráfico", "startYear": 2024, "institution": "Duoc UC"}]	[{"id": "d6000000-0000-4000-8000-000000000004", "url": null, "title": "Señalética accesible para talleres", "imageUrl": null, "description": "Sistema visual de alto contraste probado en recorridos y espacios de trabajo.", "technologies": ["Figma", "Illustrator"], "repositoryUrl": null}]	[]
d1000000-0000-4000-8000-000000000010	nico.turno	Nicolás Fuentes	Sobreviviendo a prácticas, apuntes y alarmas demasiado tempranas.	Duoc UC	Técnico en Enfermería	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000003.jpg	2026-05-03 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Puente Alto	\N	2026-10-05 22:40:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000010", "current": true, "endYear": null, "program": "Técnico en Enfermería", "startYear": 2024, "institution": "Duoc UC"}]	[]	[]
d1000000-0000-4000-8000-000000000011	isi.marketing	Isidora Peña	Marketing, tendencias y métricas que sí deberían venir con contexto.	Duoc UC	Ingeniería en Marketing Digital	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000001.jpg	2026-04-29 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Maipú	\N	2026-10-05 22:17:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000011", "current": true, "endYear": null, "program": "Ingeniería en Marketing Digital", "startYear": 2024, "institution": "Duoc UC"}]	[]	[]
d1000000-0000-4000-8000-000000000012	seba_ultimahora	Sebastián Lagos	Llego justo, entrego justo y siempre tengo una opinión impopular.	Duoc UC	Ingeniería en Informática	/api/v1/uploads/files/d2000000-0000-4000-8000-000000000004.jpg	2026-04-25 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Sede Plaza Norte	\N	2026-10-05 21:54:03.062+00	[{"id": "d5000000-0000-4000-8000-000000000012", "current": true, "endYear": null, "program": "Ingeniería en Informática", "startYear": 2024, "institution": "Duoc UC"}]	[]	[]
d1000000-0000-4000-8000-000000000013	noticias.duoc.demo	Noticias Duoc UC · demo	Cuenta demostrativa no oficial. Resume información pública y enlaza siempre la fuente original de Duoc UC.	Duoc UC	Administración Pública	\N	2026-04-21 02:07:03.062+00	2026-10-06 02:07:03.062+00	\N	Campus Virtual	\N	2026-10-05 21:31:03.062+00	[]	[]	[]
\.


--
-- Data for Name: qr_codes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."qr_codes" ("id", "owner_id", "code", "expires_at", "used_at", "used_by_id", "created_at") FROM stdin;
\.


--
-- Data for Name: reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."reports" ("id", "reporter_id", "assigned_to_id", "resource_type", "resource_id", "reason", "details", "status", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: study_session_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."study_session_events" ("id", "session_id", "user_id", "type", "focused_seconds", "occurred_at") FROM stdin;
\.


--
-- Data for Name: study_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."study_sessions" ("id", "user_id", "course_id", "task_id", "client_request_id", "method", "status", "planned_duration_seconds", "break_duration_seconds", "focused_seconds", "started_at", "active_started_at", "last_heartbeat_at", "paused_at", "ended_at", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: support_request_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."support_request_events" ("id", "request_id", "actor_id", "type", "from_status", "to_status", "note", "created_at") FROM stdin;
\.


--
-- Data for Name: support_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."support_requests" ("id", "requester_id", "assigned_to_id", "source_message_id", "category", "subject", "description", "desired_outcome", "urgency", "status", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: tasks; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."tasks" ("id", "chat_id", "created_by_id", "assigned_to_id", "title", "description", "due_date", "priority", "status", "created_at", "updated_at") FROM stdin;
\.


--
-- Data for Name: uploaded_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."uploaded_files" ("id", "owner_id", "stored_name", "original_name", "mime_type", "size", "created_at") FROM stdin;
d2000000-0000-4000-8000-000000000001	d1000000-0000-4000-8000-000000000011	d2000000-0000-4000-8000-000000000001.jpg	avatar-orange-cat.jpg	image/jpeg	209755	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000002	d1000000-0000-4000-8000-000000000005	d2000000-0000-4000-8000-000000000002.jpg	avatar-black-cat.jpg	image/jpeg	365737	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000003	d1000000-0000-4000-8000-000000000010	d2000000-0000-4000-8000-000000000003.jpg	avatar-grey-kitten.jpg	image/jpeg	487985	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000004	d1000000-0000-4000-8000-000000000012	d2000000-0000-4000-8000-000000000004.jpg	avatar-grumpy-cat.jpg	image/jpeg	552825	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000005	d1000000-0000-4000-8000-000000000003	d2000000-0000-4000-8000-000000000005.png	avatar-kiki.png	image/png	774800	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000006	d1000000-0000-4000-8000-000000000009	d2000000-0000-4000-8000-000000000006.jpg	avatar-pepper.jpg	image/jpeg	387246	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000007	d1000000-0000-4000-8000-000000000002	d2000000-0000-4000-8000-000000000007.png	avatar-godot.png	image/png	60053	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000008	d1000000-0000-4000-8000-000000000004	d2000000-0000-4000-8000-000000000008.png	avatar-supertuxkart.png	image/png	176410	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000009	d1000000-0000-4000-8000-000000000001	d2000000-0000-4000-8000-000000000009.jpg	post-cat-laptop.jpg	image/jpeg	343000	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000010	d1000000-0000-4000-8000-000000000008	d2000000-0000-4000-8000-000000000010.jpg	post-black-cat-computer.jpg	image/jpeg	204021	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000011	d1000000-0000-4000-8000-000000000006	d2000000-0000-4000-8000-000000000011.jpg	post-study-desk.jpg	image/jpeg	205817	2026-10-06 02:07:03.062+00
d2000000-0000-4000-8000-000000000012	d1000000-0000-4000-8000-000000000007	d2000000-0000-4000-8000-000000000012.jpg	post-purple-workspace.jpg	image/jpeg	330608	2026-10-06 02:07:03.062+00
\.


--
-- Data for Name: user_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."user_sessions" ("id", "user_id", "token_hash", "expires_at", "created_at", "last_used_at") FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY "public"."users" ("id", "email", "password_hash", "role", "status", "created_at", "updated_at") FROM stdin;
d1000000-0000-4000-8000-000000000001	vale.compila@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-06-08 02:07:03.062+00	2026-06-08 02:07:03.062+00
d1000000-0000-4000-8000-000000000002	mati.en.loop@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-06-04 02:07:03.062+00	2026-06-04 02:07:03.062+00
d1000000-0000-4000-8000-000000000003	fer.trazos@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-05-31 02:07:03.062+00	2026-05-31 02:07:03.062+00
d1000000-0000-4000-8000-000000000004	dieguito.wav@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-05-27 02:07:03.062+00	2026-05-27 02:07:03.062+00
d1000000-0000-4000-8000-000000000005	cami.logistica@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-05-23 02:07:03.062+00	2026-05-23 02:07:03.062+00
d1000000-0000-4000-8000-000000000006	tomas.sin.cafe@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-05-19 02:07:03.062+00	2026-05-19 02:07:03.062+00
d1000000-0000-4000-8000-000000000007	anto.en.camara@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-05-15 02:07:03.062+00	2026-05-15 02:07:03.062+00
d1000000-0000-4000-8000-000000000008	benja.redes@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-05-11 02:07:03.062+00	2026-05-11 02:07:03.062+00
d1000000-0000-4000-8000-000000000009	javi.disena@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-05-07 02:07:03.062+00	2026-05-07 02:07:03.062+00
d1000000-0000-4000-8000-000000000010	nico.turno@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-05-03 02:07:03.062+00	2026-05-03 02:07:03.062+00
d1000000-0000-4000-8000-000000000011	isi.marketing@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-04-29 02:07:03.062+00	2026-04-29 02:07:03.062+00
d1000000-0000-4000-8000-000000000012	seba.ultimahora@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	student	active	2026-04-25 02:07:03.062+00	2026-04-25 02:07:03.062+00
d1000000-0000-4000-8000-000000000013	noticias.duoc.demo@demo.konea.local	scrypt$16384$8$1$FzNwZlw7AUoFVIHr8QL0vw$J6cUVCckyx154QhycgUf51HGPIBn4fmE-hkqSs6LQAQVrezXpD2NYmrLAT9dXqN9auahKtb_kYSHMOqrLN5rng	professor	active	2026-04-21 02:07:03.062+00	2026-04-21 02:07:03.062+00
\.


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE SET; Schema: drizzle; Owner: -
--

SELECT pg_catalog.setval('"drizzle"."__drizzle_migrations_id_seq"', 13, true);


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

\unrestrict bSBFypnryGLdGdITt5JYu3anJ2LlJlfvYfi0WumTNRSyTn5zJKyN5o7mvEqp2ae

