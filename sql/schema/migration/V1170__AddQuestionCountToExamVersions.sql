ALTER TABLE exam.exam_versions
  ADD COLUMN question_count INT DEFAULT NULL;

COMMENT ON COLUMN exam.exam_versions.question_count IS
  'When set, each attempt draws this many randomly-selected questions from the version pool. NULL means all questions are used.';
