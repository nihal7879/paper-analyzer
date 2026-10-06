create table `boards` (`id` int unsigned not null auto_increment primary key, `code` varchar(20) not null comment 'CIE, EDEXCEL, AQA, OCR, IB, CBSE, MOE', `name` varchar(120) not null comment 'Cambridge International, Pearson Edexcel', `short_name` varchar(40) not null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `boards` add unique `boards_code_unique`(`code`);

create table `curriculums` (`id` int unsigned not null auto_increment primary key, `board_id` int unsigned not null, `name` varchar(120) not null comment 'CIE AS & A Level, Edexcel AS Level', `level` varchar(60) null comment 'AS, A Level, IGCSE, Grade 10 ...', `sort_order` smallint not null default '0', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `curriculums` add constraint `curriculums_board_id_foreign` foreign key (`board_id`) references `boards` (`id`) on delete RESTRICT;

alter table `curriculums` add unique `curriculums_board_id_name_unique`(`board_id`, `name`);

create table `subjects` (`id` int unsigned not null auto_increment primary key, `curriculum_id` int unsigned not null, `code` varchar(20) not null comment '9702, 8PH0, WPH11', `name` varchar(120) not null comment 'Physics', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `subjects` add constraint `subjects_curriculum_id_foreign` foreign key (`curriculum_id`) references `curriculums` (`id`) on delete RESTRICT;

alter table `subjects` add unique `subjects_curriculum_id_code_unique`(`curriculum_id`, `code`);

alter table `subjects` add index `subjects_code_index`(`code`);

create table `components` (`id` int unsigned not null auto_increment primary key, `subject_id` int unsigned not null, `number` smallint not null comment 'Paper number: 1, 2, 3 ...', `name` varchar(160) not null comment 'Multiple Choice, Core Physics I', `style` enum('MCQ', 'THEORY', 'PRACTICAL', 'MIXED') not null default 'MIXED', `total_marks` smallint null, `duration_min` smallint null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `components` add constraint `components_subject_id_foreign` foreign key (`subject_id`) references `subjects` (`id`) on delete CASCADE;

alter table `components` add unique `components_subject_id_number_unique`(`subject_id`, `number`);

create table `topics` (`id` int unsigned not null auto_increment primary key, `subject_id` int unsigned not null, `parent_id` int unsigned null comment 'NULL = topic, else subtopic', `code` varchar(20) null comment 'Syllabus number, e.g. 3 or 3.2', `name` varchar(200) not null, `source` enum('SYLLABUS', 'AI', 'MANUAL') not null default 'SYLLABUS' comment 'AI = created from extraction, needs review', `sort_order` smallint not null default '0', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `topics` add constraint `topics_subject_id_foreign` foreign key (`subject_id`) references `subjects` (`id`) on delete CASCADE;

alter table `topics` add constraint `topics_parent_id_foreign` foreign key (`parent_id`) references `topics` (`id`) on delete CASCADE;

alter table `topics` add unique `topics_subject_id_parent_id_name_unique`(`subject_id`, `parent_id`, `name`);

alter table `topics` add index `topics_subject_id_code_index`(`subject_id`, `code`);

create table `seasons` (`code` varchar(1) comment 'j, m, s, w', `name` varchar(40) not null comment 'January, Feb/March, May/June, Oct/Nov', `sort_order` smallint not null, primary key (`code`)) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

create table `users` (`id` int unsigned not null auto_increment primary key, `name` varchar(120) not null, `email` varchar(190) not null, `password_hash` varchar(255) null, `role` enum('SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT') not null default 'STUDENT', `status` enum('ACTIVE', 'INVITED', 'DISABLED') not null default 'ACTIVE', `last_login_at` timestamp null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `users` add unique `users_email_unique`(`email`);

create table `papers` (`id` int unsigned not null auto_increment primary key, `slug` varchar(60) not null comment '8PH0_s16_01 - also the storage folder name', `subject_id` int unsigned not null, `component_id` int unsigned null, `year` smallint not null, `season_code` varchar(1) not null, `paper_code` varchar(10) not null comment 'As printed: 11, 01', `variant` tinyint null comment 'Cambridge variant digit', `component_name` varchar(160) null comment 'Paper title printed on the cover', `qp_file_name` varchar(255) not null comment 'Original file name', `ms_file_name` varchar(255) null, `qp_path` varchar(255) not null comment 'Storage key, e.g. papers/8PH0_s16_01/qp.pdf', `ms_path` varchar(255) null, `qp_page_count` smallint null, `ms_page_count` smallint null, `status` enum('UPLOADED', 'PROCESSING', 'IN_REVIEW', 'PUBLISHED', 'FAILED', 'ARCHIVED') not null default 'UPLOADED', `ai_provider` varchar(40) null, `ai_model` varchar(80) null, `processed_at` timestamp null, `published_at` timestamp null, `published_by` int unsigned null, `created_by` int unsigned null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `papers` add unique `papers_slug_unique`(`slug`);

alter table `papers` add constraint `papers_subject_id_foreign` foreign key (`subject_id`) references `subjects` (`id`) on delete RESTRICT;

alter table `papers` add constraint `papers_component_id_foreign` foreign key (`component_id`) references `components` (`id`) on delete SET NULL;

alter table `papers` add constraint `papers_season_code_foreign` foreign key (`season_code`) references `seasons` (`code`);

alter table `papers` add constraint `papers_published_by_foreign` foreign key (`published_by`) references `users` (`id`) on delete SET NULL;

alter table `papers` add constraint `papers_created_by_foreign` foreign key (`created_by`) references `users` (`id`) on delete SET NULL;

alter table `papers` add unique `papers_subject_id_year_season_code_paper_code_unique`(`subject_id`, `year`, `season_code`, `paper_code`);

alter table `papers` add index `papers_status_index`(`status`);

alter table `papers` add index `papers_subject_id_status_year_index`(`subject_id`, `status`, `year`);

create table `processing_jobs` (`id` int unsigned not null auto_increment primary key, `paper_id` int unsigned not null, `state` enum('QUEUED', 'RENDERING', 'EXTRACTING', 'MARK_SCHEME', 'DONE', 'FAILED') not null default 'QUEUED', `progress` tinyint unsigned not null default '0', `message` varchar(500) null, `pages_total` smallint not null default '0', `pages_done` smallint not null default '0', `questions_found` smallint not null default '0', `failed_pages` json null comment '{ qp: [5, 9], ms: [3] }', `error` text null, `started_at` timestamp null, `finished_at` timestamp null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `processing_jobs` add constraint `processing_jobs_paper_id_foreign` foreign key (`paper_id`) references `papers` (`id`) on delete CASCADE;

alter table `processing_jobs` add index `processing_jobs_paper_id_created_at_index`(`paper_id`, `created_at`);

create table `questions` (`id` int unsigned not null auto_increment primary key, `paper_id` int unsigned not null, `subject_id` int unsigned not null comment 'Copied from paper for fast filtering', `number` varchar(30) not null comment 'As printed: 1, 3(b)(ii)', `sort_order` smallint not null default '0', `type` enum('MCQ', 'THEORY', 'STRUCTURED') not null, `marks` smallint null, `text` MEDIUMTEXT not null comment 'Markdown + LaTeX ($...$)', `options` json null comment 'MCQ: [{label:"A", text:"..."}]', `topic_id` int unsigned null, `subtopic_id` int unsigned null, `subtopic_label` varchar(200) null comment 'AI subtopic text when no subtopic row matches', `difficulty` enum('EASY', 'MEDIUM', 'HARD') not null default 'MEDIUM', `page` smallint not null comment 'First page in the question paper', `pages` json null comment 'All pages, e.g. [7, 8]', `confidence` decimal(3, 2) null comment 'AI confidence 0..1', `status` enum('DRAFT', 'VERIFIED', 'PUBLISHED') not null default 'DRAFT', `verified_by` int unsigned null, `verified_at` timestamp null, `similar_ids` json null comment 'Pre-computed similar question ids, best first', `similar_updated_at` timestamp null, `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `questions` add constraint `questions_paper_id_foreign` foreign key (`paper_id`) references `papers` (`id`) on delete CASCADE;

alter table `questions` add constraint `questions_subject_id_foreign` foreign key (`subject_id`) references `subjects` (`id`);

alter table `questions` add constraint `questions_topic_id_foreign` foreign key (`topic_id`) references `topics` (`id`) on delete SET NULL;

alter table `questions` add constraint `questions_subtopic_id_foreign` foreign key (`subtopic_id`) references `topics` (`id`) on delete SET NULL;

alter table `questions` add constraint `questions_verified_by_foreign` foreign key (`verified_by`) references `users` (`id`) on delete SET NULL;

alter table `questions` add unique `questions_paper_id_number_unique`(`paper_id`, `number`);

alter table `questions` add index `questions_subject_id_status_index`(`subject_id`, `status`);

alter table `questions` add index `questions_topic_id_status_index`(`topic_id`, `status`);

alter table `questions` add index `questions_difficulty_index`(`difficulty`);

ALTER TABLE questions ADD FULLTEXT INDEX ft_questions_text (text);

create table `answers` (`question_id` int unsigned, `correct_option` varchar(2) null comment 'MCQ letter', `text` MEDIUMTEXT null comment 'Mark scheme points, Markdown + LaTeX', `source` enum('MARK_SCHEME', 'MANUAL') not null default 'MARK_SCHEME', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, primary key (`question_id`)) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `answers` add constraint `answers_question_id_foreign` foreign key (`question_id`) references `questions` (`id`) on delete CASCADE;

ALTER TABLE answers ADD FULLTEXT INDEX ft_answers_text (text);

create table `question_images` (`id` int unsigned not null auto_increment primary key, `question_id` int unsigned not null, `kind` enum('QUESTION', 'ANSWER') not null default 'QUESTION', `source` enum('QP', 'MS') not null default 'QP' comment 'Which PDF the crop comes from', `page` smallint not null, `box` json not null comment '{x0,y0,x1,y1} as 0..1 fractions of the page', `file_path` varchar(255) null comment 'Cropped WebP storage key; NULL = crop on the fly', `sort_order` smallint not null default '0', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `question_images` add constraint `question_images_question_id_foreign` foreign key (`question_id`) references `questions` (`id`) on delete CASCADE;

alter table `question_images` add index `question_images_question_id_kind_sort_order_index`(`question_id`, `kind`, `sort_order`);

create table `question_keywords` (`question_id` int unsigned not null, `keyword` varchar(80) not null, primary key (`question_id`, `keyword`)) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `question_keywords` add constraint `question_keywords_question_id_foreign` foreign key (`question_id`) references `questions` (`id`) on delete CASCADE;

alter table `question_keywords` add index `question_keywords_keyword_index`(`keyword`);

create table `question_embeddings` (`question_id` int unsigned, `model` varchar(80) not null comment 'e.g. bge-small-en-v1.5 - vectors from different models are not comparable', `dimensions` smallint not null comment 'e.g. 384', `embedding` blob not null comment 'float32 little-endian, dimensions x 4 bytes', `text_hash` varchar(64) not null comment 'sha256 of the embedded text - re-embed only when it changes', `created_at` timestamp not null default CURRENT_TIMESTAMP, `updated_at` timestamp not null default CURRENT_TIMESTAMP, primary key (`question_id`)) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `question_embeddings` add constraint `question_embeddings_question_id_foreign` foreign key (`question_id`) references `questions` (`id`) on delete CASCADE;

alter table `question_embeddings` add index `question_embeddings_model_index`(`model`);

create table `audit_logs` (`id` bigint unsigned not null auto_increment primary key, `user_id` int unsigned null, `action` varchar(60) not null comment 'PAPER_UPLOADED, QUESTION_EDITED, PAPER_PUBLISHED ...', `entity` varchar(40) not null comment 'paper, question ...', `entity_id` int unsigned null, `data` json null, `created_at` timestamp not null default CURRENT_TIMESTAMP) default character set utf8mb4 collate utf8mb4_unicode_ci engine = InnoDB;

alter table `audit_logs` add constraint `audit_logs_user_id_foreign` foreign key (`user_id`) references `users` (`id`) on delete SET NULL;

alter table `audit_logs` add index `audit_logs_entity_entity_id_index`(`entity`, `entity_id`);

alter table `audit_logs` add index `audit_logs_created_at_index`(`created_at`);
