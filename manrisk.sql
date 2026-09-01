/*
 Navicat Premium Data Transfer

 Source Server         : 192.168.0.120
 Source Server Type    : PostgreSQL
 Source Server Version : 160014 (160014)
 Source Host           : 192.168.0.120:5432
 Source Catalog        : manrisk
 Source Schema         : public

 Target Server Type    : PostgreSQL
 Target Server Version : 160014 (160014)
 File Encoding         : 65001

 Date: 01/09/2026 11:05:54
*/


-- ----------------------------
-- Sequence structure for Team_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."Team_id_seq";
CREATE SEQUENCE "public"."Team_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 2147483647
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for UserTeam_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."UserTeam_id_seq";
CREATE SEQUENCE "public"."UserTeam_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 2147483647
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for kategori_resiko_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."kategori_resiko_id_seq";
CREATE SEQUENCE "public"."kategori_resiko_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 2147483647
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for matrik_resiko_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."matrik_resiko_id_seq";
CREATE SEQUENCE "public"."matrik_resiko_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 2147483647
START 1
CACHE 1;

-- ----------------------------
-- Sequence structure for roles_id_seq
-- ----------------------------
DROP SEQUENCE IF EXISTS "public"."roles_id_seq";
CREATE SEQUENCE "public"."roles_id_seq" 
INCREMENT 1
MINVALUE  1
MAXVALUE 2147483647
START 1
CACHE 1;

-- ----------------------------
-- Table structure for Team
-- ----------------------------
DROP TABLE IF EXISTS "public"."Team";
CREATE TABLE "public"."Team" (
  "id" int4 NOT NULL DEFAULT nextval('"Team_id_seq"'::regclass),
  "name" text COLLATE "pg_catalog"."default" NOT NULL,
  "plan" text COLLATE "pg_catalog"."default" NOT NULL,
  "code" text COLLATE "pg_catalog"."default" NOT NULL
)
;

-- ----------------------------
-- Table structure for UserTeam
-- ----------------------------
DROP TABLE IF EXISTS "public"."UserTeam";
CREATE TABLE "public"."UserTeam" (
  "id" int4 NOT NULL DEFAULT nextval('"UserTeam_id_seq"'::regclass),
  "teamId" int4 NOT NULL,
  "user_uuid" uuid
)
;

-- ----------------------------
-- Table structure for _prisma_migrations
-- ----------------------------
DROP TABLE IF EXISTS "public"."_prisma_migrations";
CREATE TABLE "public"."_prisma_migrations" (
  "id" varchar(36) COLLATE "pg_catalog"."default" NOT NULL,
  "checksum" varchar(64) COLLATE "pg_catalog"."default" NOT NULL,
  "finished_at" timestamptz(6),
  "migration_name" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "logs" text COLLATE "pg_catalog"."default",
  "rolled_back_at" timestamptz(6),
  "started_at" timestamptz(6) NOT NULL DEFAULT now(),
  "applied_steps_count" int4 NOT NULL DEFAULT 0
)
;

-- ----------------------------
-- Table structure for action_kontrol
-- ----------------------------
DROP TABLE IF EXISTS "public"."action_kontrol";
CREATE TABLE "public"."action_kontrol" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "risk_id" uuid NOT NULL,
  "action_plan" text COLLATE "pg_catalog"."default" NOT NULL,
  "pic_name" varchar(100) COLLATE "pg_catalog"."default",
  "target_date" date,
  "kebutuhan_sumberdaya" text COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP,
  "status" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'Open'::character varying,
  "bukti_mitigasi" text COLLATE "pg_catalog"."default",
  "kontrol_id" uuid NOT NULL,
  "created_by_uuid" uuid,
  "updated_at" timestamp(6) DEFAULT now(),
  "realisasi_date" timestamp(6)
)
;

-- ----------------------------
-- Table structure for evaluasi_resiko
-- ----------------------------
DROP TABLE IF EXISTS "public"."evaluasi_resiko";
CREATE TABLE "public"."evaluasi_resiko" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "risk_id" uuid NOT NULL,
  "strategi" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "prioritas" int4,
  "justifikasi" text COLLATE "pg_catalog"."default",
  "evaluated_by" uuid,
  "created_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP,
  "is_active" bool DEFAULT false
)
;

-- ----------------------------
-- Table structure for identifikasi_resiko
-- ----------------------------
DROP TABLE IF EXISTS "public"."identifikasi_resiko";
CREATE TABLE "public"."identifikasi_resiko" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "nama_resiko" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "deskripsi" text COLLATE "pg_catalog"."default",
  "kategori_id" int4,
  "root_cause" text COLLATE "pg_catalog"."default",
  "consequences" text COLLATE "pg_catalog"."default",
  "existing_controls" text COLLATE "pg_catalog"."default",
  "created_by" int4,
  "created_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP,
  "konteks_id" uuid,
  "status" varchar(20) COLLATE "pg_catalog"."default" DEFAULT 'Open'::character varying,
  "close_reason" text COLLATE "pg_catalog"."default",
  "closed_at" timestamp(6),
  "fase" varchar(50) COLLATE "pg_catalog"."default" DEFAULT 'Identifikasi'::character varying,
  "created_by_uuid" uuid
)
;

-- ----------------------------
-- Table structure for kategori_resiko
-- ----------------------------
DROP TABLE IF EXISTS "public"."kategori_resiko";
CREATE TABLE "public"."kategori_resiko" (
  "id" int4 NOT NULL DEFAULT nextval('kategori_resiko_id_seq'::regclass),
  "name" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "description" text COLLATE "pg_catalog"."default"
)
;

-- ----------------------------
-- Records of kategori_resiko
-- ----------------------------
INSERT INTO "public"."kategori_resiko" VALUES (1, 'Strategis', NULL);
INSERT INTO "public"."kategori_resiko" VALUES (2, 'Operasional', NULL);
INSERT INTO "public"."kategori_resiko" VALUES (3, 'Keuangan', NULL);
INSERT INTO "public"."kategori_resiko" VALUES (4, 'Kepatuhan', NULL);
INSERT INTO "public"."kategori_resiko" VALUES (5, 'Teknologi', NULL);
INSERT INTO "public"."kategori_resiko" VALUES (6, 'Kecurangan', NULL);
INSERT INTO "public"."kategori_resiko" VALUES (7, 'Reputasi', NULL);

-- ----------------------------
-- Table structure for kejadian_risiko_detail
-- ----------------------------
DROP TABLE IF EXISTS "public"."kejadian_risiko_detail";
CREATE TABLE "public"."kejadian_risiko_detail" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "log_bulanan_id" uuid NOT NULL,
  "risk_id" uuid NOT NULL,
  "tanggal_kejadian" date NOT NULL,
  "sebab_saat_ini" text COLLATE "pg_catalog"."default" NOT NULL,
  "dampak_riil" text COLLATE "pg_catalog"."default" NOT NULL,
  "created_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP,
  "tindakan_lanjutan" text COLLATE "pg_catalog"."default",
  "is_nihil" bool NOT NULL DEFAULT false,
  "keterangan_nihil" text COLLATE "pg_catalog"."default"
)
;

-- ----------------------------
-- Table structure for konteks_resiko
-- ----------------------------
DROP TABLE IF EXISTS "public"."konteks_resiko";
CREATE TABLE "public"."konteks_resiko" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "politik_ekonomi" text COLLATE "pg_catalog"."default",
  "sosial_teknologi" text COLLATE "pg_catalog"."default",
  "hukum_regulasi" text COLLATE "pg_catalog"."default",
  "lingkungan" text COLLATE "pg_catalog"."default",
  "sasaran_strategis" text COLLATE "pg_catalog"."default",
  "kapabilitas_sumber_daya" text COLLATE "pg_catalog"."default",
  "struktur_budaya" text COLLATE "pg_catalog"."default",
  "ambang_dampak_rp" int8,
  "metode_evaluasi" varchar(30) COLLATE "pg_catalog"."default",
  "selera_resiko" varchar(30) COLLATE "pg_catalog"."default",
  "periode" varchar(20) COLLATE "pg_catalog"."default",
  "unit_kerja" varchar(100) COLLATE "pg_catalog"."default",
  "status" bool DEFAULT true,
  "dibuat_oleh" uuid,
  "dibuat_pada" timestamptz(6) DEFAULT CURRENT_TIMESTAMP,
  "diperbarui_pada" timestamptz(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Table structure for kontrol_pengendalian
-- ----------------------------
DROP TABLE IF EXISTS "public"."kontrol_pengendalian";
CREATE TABLE "public"."kontrol_pengendalian" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "risk_id" uuid NOT NULL,
  "nama_kontrol" varchar(255) COLLATE "pg_catalog"."default" NOT NULL,
  "tipe" varchar(20) COLLATE "pg_catalog"."default",
  "deskripsi" text COLLATE "pg_catalog"."default",
  "document_link" text COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) DEFAULT now(),
  "created_by_uuid" uuid,
  "updated_at" timestamp(6) DEFAULT now()
)
;

-- ----------------------------
-- Table structure for log_risiko_bulanan
-- ----------------------------
DROP TABLE IF EXISTS "public"."log_risiko_bulanan";
CREATE TABLE "public"."log_risiko_bulanan" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tahun" int4 NOT NULL,
  "bulan" int4 NOT NULL,
  "status_laporan" varchar(20) COLLATE "pg_catalog"."default" NOT NULL DEFAULT 'BELUM_DIISI'::character varying,
  "reported_by" uuid,
  "reported_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Table structure for matrik_resiko
-- ----------------------------
DROP TABLE IF EXISTS "public"."matrik_resiko";
CREATE TABLE "public"."matrik_resiko" (
  "id" int4 NOT NULL DEFAULT nextval('matrik_resiko_id_seq'::regclass),
  "min_score" int4 NOT NULL,
  "max_score" int4 NOT NULL,
  "risk_level" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "color_hex" varchar(7) COLLATE "pg_catalog"."default" NOT NULL,
  "description" text COLLATE "pg_catalog"."default"
)
;

-- ----------------------------
-- Table structure for pemantauan_resiko
-- ----------------------------
DROP TABLE IF EXISTS "public"."pemantauan_resiko";
CREATE TABLE "public"."pemantauan_resiko" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "risk_id" uuid NOT NULL,
  "progress_persen" int4 DEFAULT 0,
  "efektifitas" varchar(50) COLLATE "pg_catalog"."default",
  "review_kendala" text COLLATE "pg_catalog"."default",
  "updated_by" uuid,
  "updated_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP,
  "nama_resiko" varchar(255) COLLATE "pg_catalog"."default",
  "residual_score" numeric(10,2),
  "effectiveness_avg" numeric(10,2),
  "closed_reason" text COLLATE "pg_catalog"."default",
  "created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Table structure for penilaian_kontrol
-- ----------------------------
DROP TABLE IF EXISTS "public"."penilaian_kontrol";
CREATE TABLE "public"."penilaian_kontrol" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "kontrol_id" uuid NOT NULL,
  "effectiveness" int4 NOT NULL,
  "status" varchar(15) COLLATE "pg_catalog"."default" NOT NULL,
  "assessed_at" timestamptz(6) DEFAULT now(),
  "created_at" timestamp(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Table structure for penilaian_resiko
-- ----------------------------
DROP TABLE IF EXISTS "public"."penilaian_resiko";
CREATE TABLE "public"."penilaian_resiko" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "risk_id" uuid NOT NULL,
  "assessment_type" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "likelihood" int4 NOT NULL,
  "impact" int4 NOT NULL,
  "score" int4 GENERATED ALWAYS AS (
(likelihood * impact)
) STORED,
  "assessed_by" uuid,
  "created_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Table structure for profile_risiko
-- ----------------------------
DROP TABLE IF EXISTS "public"."profile_risiko";
CREATE TABLE "public"."profile_risiko" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "risk_analysis_id" uuid NOT NULL,
  "risk_level" varchar(20) COLLATE "pg_catalog"."default" NOT NULL,
  "owner_id" uuid,
  "assigned_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Table structure for roles
-- ----------------------------
DROP TABLE IF EXISTS "public"."roles";
CREATE TABLE "public"."roles" (
  "id" int4 NOT NULL DEFAULT nextval('roles_id_seq'::regclass),
  "name" varchar(20) COLLATE "pg_catalog"."default" NOT NULL
)
;

-- ----------------------------
-- Table structure for users
-- ----------------------------
DROP TABLE IF EXISTS "public"."users";
CREATE TABLE "public"."users" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "username" varchar(50) COLLATE "pg_catalog"."default" NOT NULL,
  "password_hash" text COLLATE "pg_catalog"."default" NOT NULL,
  "email" varchar(100) COLLATE "pg_catalog"."default",
  "role_id" int4,
  "department" varchar(100) COLLATE "pg_catalog"."default",
  "created_at" timestamptz(6) DEFAULT CURRENT_TIMESTAMP,
  "login_attempts" int4 DEFAULT 0,
  "locked_until" timestamp(6),
  "last_login" timestamp(6),
  "is_online" bool DEFAULT false,
  "last_seen" timestamptz(6) DEFAULT CURRENT_TIMESTAMP
)
;

-- ----------------------------
-- Records of users
-- ----------------------------
INSERT INTO "public"."users" VALUES ('4b624a48-fddc-4a5e-9200-74cba335eafa', 'Sigit', '$2a$12$hZyD4a7JDjpE34hcMwn2POfyJNJpKRJOJopFNx7YAEvNq3aUJyRoO', 'manrisk@gmail.com', 1, NULL, '2026-01-02 02:56:49.124+00', 0, NULL, '2026-02-17 00:05:00.040971', 'f', '2026-07-28 10:28:25.641752+00');

-- ----------------------------
-- Function structure for armor
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."armor"(bytea, _text, _text);
CREATE OR REPLACE FUNCTION "public"."armor"(bytea, _text, _text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pg_armor'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for armor
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."armor"(bytea);
CREATE OR REPLACE FUNCTION "public"."armor"(bytea)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pg_armor'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for can_add_kontrol
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."can_add_kontrol"("p_risk_id" uuid);
CREATE OR REPLACE FUNCTION "public"."can_add_kontrol"("p_risk_id" uuid)
  RETURNS "pg_catalog"."bool" AS $BODY$
DECLARE
  v_status text;
  v_strategi text;
BEGIN
  SELECT
    ir.status,
    er.strategi
  INTO
    v_status,
    v_strategi
  FROM identifikasi_resiko ir
  JOIN evaluasi_resiko er ON er.risk_id = ir.id
  WHERE ir.id = p_risk_id
  ORDER BY er.created_at DESC
  LIMIT 1;

  IF v_status = 'Closed' THEN
    RETURN false;
  END IF;

  IF v_strategi != 'TREAT' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;

-- ----------------------------
-- Function structure for check_risiko_status_before_action
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."check_risiko_status_before_action"();
CREATE OR REPLACE FUNCTION "public"."check_risiko_status_before_action"()
  RETURNS "pg_catalog"."trigger" AS $BODY$
DECLARE
  risiko_id UUID;
BEGIN
  -- Get risk_id from kontrol
  SELECT risk_id INTO risiko_id 
  FROM kontrol_pengendalian 
  WHERE id = NEW.kontrol_id;
  
  IF NOT can_add_kontrol(risiko_id) THEN
    RAISE EXCEPTION 'Risiko sudah closed atau tidak dalam fase yang diperbolehkan untuk tambah action';
  END IF;
  
  -- Juga set risk_id di action_kontrol
  NEW.risk_id = risiko_id;
  
  RETURN NEW;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;

-- ----------------------------
-- Function structure for crypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."crypt"(text, text);
CREATE OR REPLACE FUNCTION "public"."crypt"(text, text)
  RETURNS "pg_catalog"."text" AS '$libdir/pgcrypto', 'pg_crypt'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for dearmor
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."dearmor"(text);
CREATE OR REPLACE FUNCTION "public"."dearmor"(text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_dearmor'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for decrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."decrypt"(bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."decrypt"(bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_decrypt'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for decrypt_iv
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."decrypt_iv"(bytea, bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."decrypt_iv"(bytea, bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_decrypt_iv'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for digest
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."digest"(bytea, text);
CREATE OR REPLACE FUNCTION "public"."digest"(bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_digest'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for digest
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."digest"(text, text);
CREATE OR REPLACE FUNCTION "public"."digest"(text, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_digest'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for encrypt
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."encrypt"(bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."encrypt"(bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_encrypt'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for encrypt_iv
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."encrypt_iv"(bytea, bytea, bytea, text);
CREATE OR REPLACE FUNCTION "public"."encrypt_iv"(bytea, bytea, bytea, text)
  RETURNS "pg_catalog"."bytea" AS '$libdir/pgcrypto', 'pg_encrypt_iv'
  LANGUAGE c IMMUTABLE STRICT
  COST 1;

-- ----------------------------
-- Function structure for set_active_evaluasi
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."set_active_evaluasi"();
CREATE OR REPLACE FUNCTION "public"."set_active_evaluasi"()
  RETURNS "pg_catalog"."trigger" AS $BODY$
BEGIN
  UPDATE evaluasi_resiko
  SET is_active = false
  WHERE risk_id = NEW.risk_id;

  NEW.is_active = true;
  RETURN NEW;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;

-- ----------------------------
-- Function structure for trg_can_add_kontrol
-- ----------------------------
DROP FUNCTION IF EXISTS "public"."trg_can_add_kontrol"();
CREATE OR REPLACE FUNCTION "public"."trg_can_add_kontrol"()
  RETURNS "pg_catalog"."trigger" AS $BODY$
BEGIN
  IF NOT can_add_kontrol(NEW.risk_id) THEN
    RAISE EXCEPTION
      'Risiko sudah closed atau tidak dalam fase yang diperbolehkan untuk tambah kontrol';
  END IF;

  RETURN NEW;
END;
$BODY$
  LANGUAGE plpgsql VOLATILE
  COST 100;

-- ----------------------------
-- View structure for buku_register
-- ----------------------------
DROP VIEW IF EXISTS "public"."buku_register";
CREATE VIEW "public"."buku_register" AS  SELECT ir.id AS resiko_id,
    ir.nama_resiko,
    kr.name AS nama_kategori,
    pr.score AS skor_inheren,
    er.strategi,
    kp.nama_kontrol,
    pl.pic_name AS pic_action,
    pm.progress_persen,
    u.username AS dibuat_oleh,
    u.email,
    u.department
   FROM identifikasi_resiko ir
     LEFT JOIN kategori_resiko kr ON kr.id = ir.kategori_id
     LEFT JOIN penilaian_resiko pr ON pr.risk_id = ir.id AND pr.assessment_type::text = 'INHERENT'::text
     LEFT JOIN evaluasi_resiko er ON er.risk_id = ir.id
     LEFT JOIN kontrol_pengendalian kp ON kp.risk_id = ir.id
     LEFT JOIN action_kontrol pl ON pl.kontrol_id = kp.id
     LEFT JOIN pemantauan_resiko pm ON pm.risk_id = ir.id
     LEFT JOIN users u ON u.id = ir.created_by_uuid;

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
SELECT setval('"public"."Team_id_seq"', 1, false);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
SELECT setval('"public"."UserTeam_id_seq"', 1, false);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
SELECT setval('"public"."kategori_resiko_id_seq"', 1, false);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
SELECT setval('"public"."matrik_resiko_id_seq"', 1, false);

-- ----------------------------
-- Alter sequences owned by
-- ----------------------------
SELECT setval('"public"."roles_id_seq"', 1, false);

-- ----------------------------
-- Indexes structure for table action_kontrol
-- ----------------------------
CREATE INDEX "idx_action_created_by_copy1" ON "public"."action_kontrol" USING btree (
  "created_by_uuid" "pg_catalog"."uuid_ops" ASC NULLS LAST
);

-- ----------------------------
-- Primary Key structure for table action_kontrol
-- ----------------------------
ALTER TABLE "public"."action_kontrol" ADD CONSTRAINT "action_kontrol_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table evaluasi_resiko
-- ----------------------------
CREATE UNIQUE INDEX "uniq_active_evaluasi_per_risk_copy1" ON "public"."evaluasi_resiko" USING btree (
  "risk_id" "pg_catalog"."uuid_ops" ASC NULLS LAST
) WHERE is_active = true;

-- ----------------------------
-- Triggers structure for table evaluasi_resiko
-- ----------------------------
CREATE TRIGGER "trg_set_active_evaluasi" BEFORE INSERT ON "public"."evaluasi_resiko"
FOR EACH ROW
EXECUTE PROCEDURE "public"."set_active_evaluasi"();

-- ----------------------------
-- Checks structure for table evaluasi_resiko
-- ----------------------------
ALTER TABLE "public"."evaluasi_resiko" ADD CONSTRAINT "evaluasi_resiko_strategi_check" CHECK (strategi::text = ANY (ARRAY['TREAT'::character varying::text, 'TRANSFER'::character varying::text, 'AVOID'::character varying::text, 'ACCEPT'::character varying::text]));

-- ----------------------------
-- Primary Key structure for table evaluasi_resiko
-- ----------------------------
ALTER TABLE "public"."evaluasi_resiko" ADD CONSTRAINT "evaluasi_resiko_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Checks structure for table identifikasi_resiko
-- ----------------------------
ALTER TABLE "public"."identifikasi_resiko" ADD CONSTRAINT "identifikasi_resiko_fase_check" CHECK (fase::text = ANY (ARRAY['Identifikasi'::character varying::text, 'Analisis'::character varying::text, 'Evaluasi'::character varying::text, 'Perlakuan'::character varying::text, 'Pengendalian'::character varying::text, 'Pemantauan'::character varying::text, 'Closed'::character varying::text]));
ALTER TABLE "public"."identifikasi_resiko" ADD CONSTRAINT "identifikasi_resiko_fase_check1" CHECK (fase::text = ANY (ARRAY['Identifikasi'::character varying::text, 'Analisis'::character varying::text, 'Evaluasi'::character varying::text, 'Perlakuan'::character varying::text, 'Pengendalian'::character varying::text, 'Pemantauan'::character varying::text, 'Closed'::character varying::text]));

-- ----------------------------
-- Primary Key structure for table identifikasi_resiko
-- ----------------------------
ALTER TABLE "public"."identifikasi_resiko" ADD CONSTRAINT "identifikasi_resiko_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Uniques structure for table kategori_resiko
-- ----------------------------
ALTER TABLE "public"."kategori_resiko" ADD CONSTRAINT "kategori_resiko_name_key" UNIQUE ("name");

-- ----------------------------
-- Primary Key structure for table kategori_resiko
-- ----------------------------
ALTER TABLE "public"."kategori_resiko" ADD CONSTRAINT "kategori_resiko_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table kejadian_risiko_detail
-- ----------------------------
ALTER TABLE "public"."kejadian_risiko_detail" ADD CONSTRAINT "kejadian_risiko_detail_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table konteks_resiko
-- ----------------------------
ALTER TABLE "public"."konteks_resiko" ADD CONSTRAINT "konteks_resiko_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table kontrol_pengendalian
-- ----------------------------
CREATE INDEX "idx_kontrol_created_by_copy1" ON "public"."kontrol_pengendalian" USING btree (
  "created_by_uuid" "pg_catalog"."uuid_ops" ASC NULLS LAST
);

-- ----------------------------
-- Triggers structure for table kontrol_pengendalian
-- ----------------------------
CREATE TRIGGER "trg_check_kontrol_insert" BEFORE INSERT ON "public"."kontrol_pengendalian"
FOR EACH ROW
EXECUTE PROCEDURE "public"."trg_can_add_kontrol"();

-- ----------------------------
-- Checks structure for table kontrol_pengendalian
-- ----------------------------
ALTER TABLE "public"."kontrol_pengendalian" ADD CONSTRAINT "kontrol_pengendalian_tipe_check" CHECK (tipe::text = ANY (ARRAY['PREVENTIVE'::character varying::text, 'DETECTIVE'::character varying::text, 'CORRECTIVE'::character varying::text]));

-- ----------------------------
-- Primary Key structure for table kontrol_pengendalian
-- ----------------------------
ALTER TABLE "public"."kontrol_pengendalian" ADD CONSTRAINT "kontrol_pengendalian_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Uniques structure for table log_risiko_bulanan
-- ----------------------------
ALTER TABLE "public"."log_risiko_bulanan" ADD CONSTRAINT "log_risiko_bulanan_tahun_bulan_reported_by_key" UNIQUE ("tahun", "bulan", "reported_by");

-- ----------------------------
-- Primary Key structure for table log_risiko_bulanan
-- ----------------------------
ALTER TABLE "public"."log_risiko_bulanan" ADD CONSTRAINT "log_risiko_bulanan_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table matrik_resiko
-- ----------------------------
ALTER TABLE "public"."matrik_resiko" ADD CONSTRAINT "matrik_resiko_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Checks structure for table pemantauan_resiko
-- ----------------------------
ALTER TABLE "public"."pemantauan_resiko" ADD CONSTRAINT "pemantauan_resiko_progress_persen_check" CHECK (progress_persen >= 0 AND progress_persen <= 100);

-- ----------------------------
-- Primary Key structure for table pemantauan_resiko
-- ----------------------------
ALTER TABLE "public"."pemantauan_resiko" ADD CONSTRAINT "pemantauan_resiko_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Checks structure for table penilaian_kontrol
-- ----------------------------
ALTER TABLE "public"."penilaian_kontrol" ADD CONSTRAINT "penilaian_kontrol_status_check" CHECK (status::text = ANY (ARRAY['EFFECTIVE'::character varying::text, 'PARTIAL'::character varying::text, 'INEFFECTIVE'::character varying::text]));
ALTER TABLE "public"."penilaian_kontrol" ADD CONSTRAINT "penilaian_kontrol_effectiveness_check" CHECK (effectiveness >= 0 AND effectiveness <= 100);

-- ----------------------------
-- Primary Key structure for table penilaian_kontrol
-- ----------------------------
ALTER TABLE "public"."penilaian_kontrol" ADD CONSTRAINT "penilaian_kontrol_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Uniques structure for table penilaian_resiko
-- ----------------------------
ALTER TABLE "public"."penilaian_resiko" ADD CONSTRAINT "penilaian_resiko_risk_id_assessment_type_key" UNIQUE ("risk_id", "assessment_type");

-- ----------------------------
-- Checks structure for table penilaian_resiko
-- ----------------------------
ALTER TABLE "public"."penilaian_resiko" ADD CONSTRAINT "penilaian_resiko_assessment_type_check" CHECK (assessment_type::text = ANY (ARRAY['INHERENT'::character varying::text, 'RESIDUAL'::character varying::text]));
ALTER TABLE "public"."penilaian_resiko" ADD CONSTRAINT "penilaian_resiko_impact_check" CHECK (impact >= 1 AND impact <= 5);
ALTER TABLE "public"."penilaian_resiko" ADD CONSTRAINT "penilaian_resiko_likelihood_check" CHECK (likelihood >= 1 AND likelihood <= 5);

-- ----------------------------
-- Primary Key structure for table penilaian_resiko
-- ----------------------------
ALTER TABLE "public"."penilaian_resiko" ADD CONSTRAINT "penilaian_resiko_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Primary Key structure for table profile_risiko
-- ----------------------------
ALTER TABLE "public"."profile_risiko" ADD CONSTRAINT "profile_risiko_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Uniques structure for table roles
-- ----------------------------
ALTER TABLE "public"."roles" ADD CONSTRAINT "roles_name_key" UNIQUE ("name");

-- ----------------------------
-- Primary Key structure for table roles
-- ----------------------------
ALTER TABLE "public"."roles" ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Indexes structure for table users
-- ----------------------------
CREATE INDEX "idx_users_online_status" ON "public"."users" USING btree (
  "is_online" "pg_catalog"."bool_ops" ASC NULLS LAST,
  "last_seen" "pg_catalog"."timestamptz_ops" ASC NULLS LAST
);

-- ----------------------------
-- Uniques structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_username_key" UNIQUE ("username");
ALTER TABLE "public"."users" ADD CONSTRAINT "users_email_key" UNIQUE ("email");

-- ----------------------------
-- Primary Key structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");

-- ----------------------------
-- Foreign Keys structure for table action_kontrol
-- ----------------------------
ALTER TABLE "public"."action_kontrol" ADD CONSTRAINT "action_kontrol_created_by_uuid_fkey" FOREIGN KEY ("created_by_uuid") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table evaluasi_resiko
-- ----------------------------
ALTER TABLE "public"."evaluasi_resiko" ADD CONSTRAINT "evaluasi_resiko_evaluated_by_fkey" FOREIGN KEY ("evaluated_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."evaluasi_resiko" ADD CONSTRAINT "evaluasi_resiko_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "public"."identifikasi_resiko" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table identifikasi_resiko
-- ----------------------------
ALTER TABLE "public"."identifikasi_resiko" ADD CONSTRAINT "identifikasi_resiko_created_by_uuid_fkey" FOREIGN KEY ("created_by_uuid") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."identifikasi_resiko" ADD CONSTRAINT "identifikasi_resiko_kategori_id_fkey" FOREIGN KEY ("kategori_id") REFERENCES "public"."kategori_resiko" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."identifikasi_resiko" ADD CONSTRAINT "identifikasi_resiko_konteks_id_fkey" FOREIGN KEY ("konteks_id") REFERENCES "public"."konteks_resiko" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table kejadian_risiko_detail
-- ----------------------------
ALTER TABLE "public"."kejadian_risiko_detail" ADD CONSTRAINT "kejadian_risiko_detail_log_bulanan_id_fkey" FOREIGN KEY ("log_bulanan_id") REFERENCES "public"."log_risiko_bulanan" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "public"."kejadian_risiko_detail" ADD CONSTRAINT "kejadian_risiko_detail_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "public"."identifikasi_resiko" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table konteks_resiko
-- ----------------------------
ALTER TABLE "public"."konteks_resiko" ADD CONSTRAINT "konteks_resiko_dibuat_oleh_fkey" FOREIGN KEY ("dibuat_oleh") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table kontrol_pengendalian
-- ----------------------------
ALTER TABLE "public"."kontrol_pengendalian" ADD CONSTRAINT "kontrol_pengendalian_created_by_uuid_fkey" FOREIGN KEY ("created_by_uuid") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."kontrol_pengendalian" ADD CONSTRAINT "kontrol_pengendalian_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "public"."identifikasi_resiko" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table log_risiko_bulanan
-- ----------------------------
ALTER TABLE "public"."log_risiko_bulanan" ADD CONSTRAINT "log_risiko_bulanan_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table pemantauan_resiko
-- ----------------------------
ALTER TABLE "public"."pemantauan_resiko" ADD CONSTRAINT "pemantauan_resiko_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table penilaian_resiko
-- ----------------------------
ALTER TABLE "public"."penilaian_resiko" ADD CONSTRAINT "penilaian_resiko_assessed_by_fkey" FOREIGN KEY ("assessed_by") REFERENCES "public"."users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "public"."penilaian_resiko" ADD CONSTRAINT "penilaian_resiko_risk_id_fkey" FOREIGN KEY ("risk_id") REFERENCES "public"."identifikasi_resiko" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table profile_risiko
-- ----------------------------
ALTER TABLE "public"."profile_risiko" ADD CONSTRAINT "profile_risiko_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."users" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
ALTER TABLE "public"."profile_risiko" ADD CONSTRAINT "profile_risiko_risk_analysis_id_fkey" FOREIGN KEY ("risk_analysis_id") REFERENCES "public"."penilaian_resiko" ("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ----------------------------
-- Foreign Keys structure for table users
-- ----------------------------
ALTER TABLE "public"."users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
