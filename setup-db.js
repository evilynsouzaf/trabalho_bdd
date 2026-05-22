const sql = require('mssql');

const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'senha123',
    server: process.env.DB_SERVER || 'localhost',
    // Começamos conectando ao banco 'master' para garantir que podemos criar o banco 'EscolaABC' se ele não existir
    database: 'master',
    options: {
        encrypt: false, // Desabilitado para conexões locais simples
        trustServerCertificate: true, // Necessário para desenvolvimento local
        instanceName: 'SQLEXPRESS' // Indica a instância do SQLEXPRESS
    }
};

const targetDatabase = 'EscolaABC';

const queries = [
    // ==========================================
    // 1. TABELAS
    // ==========================================
    
    // Criar tabela turma
    `CREATE TABLE turma (
        idTurma INT NOT NULL IDENTITY(1,1),
        turma_nome VARCHAR(100),
        turma_ano INT,
        CONSTRAINT pk_turma PRIMARY KEY (idTurma)
    );`,

    // Criar tabela uf
    `CREATE TABLE uf (
        idUf INT NOT NULL IDENTITY(1,1),
        uf_sigla VARCHAR(2) NOT NULL,
        uf_nome VARCHAR(20) NOT NULL,
        CONSTRAINT pk_uf PRIMARY KEY (idUf)
    );`,

    // Criar tabela cidade
    `CREATE TABLE cidade (
        idCid INT NOT NULL IDENTITY(1,1),
        cid_nome VARCHAR(50) NOT NULL,
        fk_uf INT NOT NULL,
        CONSTRAINT pk_cid PRIMARY KEY (idCid),
        CONSTRAINT cid_fk_uf FOREIGN KEY (fk_uf) REFERENCES uf(idUf)
    );`,

    // Criar tabela professor
    `CREATE TABLE professor (
        idProf INT NOT NULL IDENTITY(1,1),
        prof_nome VARCHAR(100) NOT NULL,
        prof_matricula INT NOT NULL UNIQUE,
        prof_cpf VARCHAR(14) NOT NULL UNIQUE,
        prof_dateNasc DATE NOT NULL,
        prof_email VARCHAR(50),
        prof_celular VARCHAR(13) NOT NULL,
        prof_cep VARCHAR(9),
        prof_bairro VARCHAR(50),
        prof_casaNum INT,
        prof_logradouro VARCHAR(50) NOT NULL,
        prof_complemento VARCHAR(100),
        prof_status BIT NOT NULL DEFAULT 1,
        fk_cidade INT NOT NULL,
        CONSTRAINT pk_prof PRIMARY KEY (idProf),
        CONSTRAINT prof_fk_cidade FOREIGN KEY (fk_cidade) REFERENCES cidade(idCid)
    );`,

    // Criar tabela aluno
    `CREATE TABLE aluno (
        idAluno INT NOT NULL IDENTITY(1,1),
        aluno_nome VARCHAR(100) NOT NULL,
        aluno_matricula INT NOT NULL UNIQUE,
        aluno_cpf VARCHAR(14) NOT NULL UNIQUE,
        aluno_dateNasc DATE NOT NULL,
        aluno_email VARCHAR(50),
        aluno_celular VARCHAR(13) NOT NULL,
        aluno_cep VARCHAR(9),
        aluno_bairro VARCHAR(50),
        aluno_casaNum INT,
        aluno_logradouro VARCHAR(50) NOT NULL,
        aluno_complemento VARCHAR(100),
        aluno_status BIT NOT NULL DEFAULT 1,
        fk_cidade INT NOT NULL,
        fk_turma INT,
        CONSTRAINT pk_aluno PRIMARY KEY (idAluno),
        CONSTRAINT alu_fk_cidade FOREIGN KEY (fk_cidade) REFERENCES cidade(idCid),
        CONSTRAINT alu_fk_turma FOREIGN KEY (fk_turma) REFERENCES turma(idTurma)
    );`,

    // Criar tabela disciplina
    `CREATE TABLE disciplina (
        idDisc INT NOT NULL IDENTITY(1,1),
        disc_nome VARCHAR(50) NOT NULL,
        disc_descricao VARCHAR(100),
        CONSTRAINT pk_disciplina PRIMARY KEY (idDisc)
    );`,

    // Criar tabela leciona
    `CREATE TABLE leciona (
        idLeciona INT NOT NULL IDENTITY(1,1),
        fk_professor INT NOT NULL,
        fk_disciplina INT NOT NULL,
        fk_turma INT NOT NULL,
        CONSTRAINT pk_leciona PRIMARY KEY (idLeciona),
        CONSTRAINT uq_leciona_fks UNIQUE (fk_professor, fk_disciplina, fk_turma),
        CONSTRAINT lec_fk_prof FOREIGN KEY (fk_professor) REFERENCES professor(idProf),
        CONSTRAINT lec_fk_disc FOREIGN KEY (fk_disciplina) REFERENCES disciplina(idDisc),
        CONSTRAINT lec_fk_turma FOREIGN KEY (fk_turma) REFERENCES turma(idTurma)
    );`,

    // Criar tabela avaliacao
    `CREATE TABLE avaliacao (
        idAvaliacao INT NOT NULL IDENTITY(1,1),
        avali_nota1 DECIMAL(4,1),
        avali_nota2 DECIMAL(4,1),
        avali_nota3 DECIMAL(4,1),
        avali_media DECIMAL(4,1),
        fk_aluno INT NOT NULL,
        fk_leciona INT NOT NULL,
        CONSTRAINT pk_avaliacao PRIMARY KEY (idAvaliacao),
        CONSTRAINT avali_fk_aluno FOREIGN KEY (fk_aluno) REFERENCES aluno(idAluno),
        CONSTRAINT avali_fk_leciona FOREIGN KEY (fk_leciona) REFERENCES leciona(idLeciona)
    );`,

    // ==========================================
    // 2. STORED PROCEDURES
    // ==========================================

    // sp_InserirUf
    `CREATE PROCEDURE sp_InserirUf
        @UF   VARCHAR(2),
        @nome VARCHAR(20)
    AS
    BEGIN
        SET NOCOUNT ON;
        IF EXISTS (SELECT 1 FROM uf WHERE uf_sigla = @UF)
        BEGIN
            RAISERROR('Estado com UF "%s" ja existe.', 16, 1, @UF);
            RETURN;
        END
        INSERT INTO uf (uf_sigla, uf_nome)
        VALUES (@UF, @nome);
    END;`,

    // sp_InserirCidade
    `CREATE PROCEDURE sp_InserirCidade
        @nome  VARCHAR(50),
        @fk_uf INT
    AS
    BEGIN
        SET NOCOUNT ON;
        INSERT INTO cidade (cid_nome, fk_uf)
        VALUES (@nome, @fk_uf);
    END;`,

    // sp_ConferirInserirUfCidade
    `CREATE PROCEDURE sp_ConferirInserirUfCidade
        @uf_sigla VARCHAR(2),
        @uf_nome  VARCHAR(20),
        @cidade   VARCHAR(50)
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM uf WHERE uf_sigla = @uf_sigla)
        BEGIN
            INSERT INTO uf (uf_sigla, uf_nome)
            VALUES (@uf_sigla, @uf_nome);
        END

        DECLARE @idUf INT;
        SET @idUf = (SELECT idUf FROM uf WHERE uf_sigla = @uf_sigla);

        IF NOT EXISTS (
            SELECT 1 FROM cidade
            WHERE cid_nome = @cidade AND fk_uf = @idUf
        )
        BEGIN
            INSERT INTO cidade (cid_nome, fk_uf)
            VALUES (@cidade, @idUf);
        END

        SELECT idCid FROM cidade
        WHERE cid_nome = @cidade AND fk_uf = @idUf;
    END;`,

    // sp_InserirDisciplina
    `CREATE PROCEDURE sp_InserirDisciplina
        @nome      VARCHAR(50),
        @descricao VARCHAR(100)
    AS
    BEGIN
        SET NOCOUNT ON;
        INSERT INTO disciplina (disc_nome, disc_descricao)
        VALUES (@nome, @descricao);
    END;`,

    // sp_AtualizarDisciplina
    `CREATE PROCEDURE sp_AtualizarDisciplina
        @id        INT,
        @nome      VARCHAR(50),
        @descricao VARCHAR(100)
    AS
    BEGIN
        SET NOCOUNT ON;
        IF NOT EXISTS (SELECT 1 FROM disciplina WHERE idDisc = @id)
        BEGIN
            RAISERROR('Disciplina com id %d nao encontrada.', 16, 1, @id);
            RETURN;
        END
        UPDATE disciplina
        SET disc_nome = @nome, disc_descricao = @descricao
        WHERE idDisc = @id;
    END;`,

    // sp_ExcluirDisciplina
    `CREATE PROCEDURE sp_ExcluirDisciplina
        @id INT
    AS
    BEGIN
        SET NOCOUNT ON;
        IF EXISTS (SELECT 1 FROM leciona WHERE fk_disciplina = @id)
        BEGIN
            RAISERROR('Nao e possivel excluir: disciplina esta sendo lecionada.', 16, 1);
            RETURN;
        END
        DELETE FROM disciplina WHERE idDisc = @id;
    END;`,

    // sp_InserirTurma
    `CREATE PROCEDURE sp_InserirTurma
        @nome VARCHAR(100),
        @ano  INT
    AS
    BEGIN
        SET NOCOUNT ON;
        INSERT INTO turma (turma_nome, turma_ano)
        VALUES (@nome, @ano);
    END;`,

    // sp_AtualizarTurma
    `CREATE PROCEDURE sp_AtualizarTurma
        @id   INT,
        @nome VARCHAR(100),
        @ano  INT
    AS
    BEGIN
        SET NOCOUNT ON;
        IF NOT EXISTS (SELECT 1 FROM turma WHERE idTurma = @id)
        BEGIN
            RAISERROR('Turma com id %d nao encontrada.', 16, 1, @id);
            RETURN;
        END
        UPDATE turma SET turma_nome = @nome, turma_ano = @ano
        WHERE idTurma = @id;
    END;`,

    // sp_ExcluirTurma
    `CREATE PROCEDURE sp_ExcluirTurma
        @id INT
    AS
    BEGIN
        SET NOCOUNT ON;
        IF EXISTS (SELECT 1 FROM aluno WHERE fk_turma = @id)
        BEGIN
            RAISERROR('Nao e possivel excluir: existem alunos nesta turma.', 16, 1);
            RETURN;
        END
        DELETE FROM turma WHERE idTurma = @id;
    END;`,

    // sp_InserirProfessor
    `CREATE PROCEDURE sp_InserirProfessor
        @nome                VARCHAR(100),
        @email               VARCHAR(50),
        @celular             VARCHAR(13),
        @CPF                 VARCHAR(14),
        @matricula_professor INT,
        @data_nascimento     DATE,
        @uf_sigla            VARCHAR(2),
        @uf_nome             VARCHAR(20),
        @cidade              VARCHAR(50),
        @CEP                 VARCHAR(9),
        @logradouro          VARCHAR(50),
        @num_endereco        INT,
        @bairro              VARCHAR(50)
    AS
    BEGIN
        SET NOCOUNT ON;

        DECLARE @fk_cidade INT;
        CREATE TABLE #tmp_cidade_prof_ins (idCid INT);
        INSERT INTO #tmp_cidade_prof_ins
            EXEC sp_ConferirInserirUfCidade
                @uf_sigla = @uf_sigla,
                @uf_nome  = @uf_nome,
                @cidade   = @cidade;
        SET @fk_cidade = (SELECT idCid FROM #tmp_cidade_prof_ins);
        DROP TABLE #tmp_cidade_prof_ins;

        IF EXISTS (SELECT 1 FROM professor WHERE prof_cpf = @CPF)
        BEGIN
            RAISERROR('CPF "%s" ja cadastrado para outro professor.', 16, 1, @CPF);
            RETURN;
        END

        IF EXISTS (SELECT 1 FROM professor WHERE prof_matricula = @matricula_professor)
        BEGIN
            RAISERROR('Matricula %d ja cadastrada.', 16, 1, @matricula_professor);
            RETURN;
        END

        INSERT INTO professor
            (prof_nome, prof_email, prof_celular, prof_CPF, prof_matricula,
             prof_dateNasc, fk_cidade, prof_cep, prof_logradouro, prof_casaNum, prof_bairro)
        VALUES
            (@nome, @email, @celular, @CPF, @matricula_professor,
             @data_nascimento, @fk_cidade, @CEP, @logradouro, @num_endereco, @bairro);
    END;`,

    // sp_AtualizarProfessor
    `CREATE PROCEDURE sp_AtualizarProfessor
        @id                  INT,
        @nome                VARCHAR(100),
        @email               VARCHAR(50),
        @celular             VARCHAR(13),
        @CPF                 VARCHAR(14),
        @matricula_professor INT,
        @data_nascimento     DATE,
        @uf_sigla            VARCHAR(2),
        @uf_nome             VARCHAR(20),
        @cidade              VARCHAR(50),
        @CEP                 VARCHAR(9),
        @logradouro          VARCHAR(50),
        @num_endereco        INT,
        @bairro              VARCHAR(50)
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM professor WHERE idProf = @id)
        BEGIN
            RAISERROR('Professor com id %d nao encontrado.', 16, 1, @id);
            RETURN;
        END

        IF EXISTS (SELECT 1 FROM professor WHERE prof_CPF = @CPF AND idProf <> @id)
        BEGIN
            RAISERROR('CPF "%s" ja cadastrado para outro professor.', 16, 1, @CPF);
            RETURN;
        END

        DECLARE @fk_cidade INT;
        CREATE TABLE #tmp_cidade_prof_upd (idCid INT);
        INSERT INTO #tmp_cidade_prof_upd
            EXEC sp_ConferirInserirUfCidade
                @uf_sigla = @uf_sigla,
                @uf_nome  = @uf_nome,
                @cidade   = @cidade;
        SET @fk_cidade = (SELECT idCid FROM #tmp_cidade_prof_upd);
        DROP TABLE #tmp_cidade_prof_upd;

        UPDATE professor
        SET prof_nome        = @nome,
            prof_email       = @email,
            prof_celular     = @celular,
            prof_CPF         = @CPF,
            prof_matricula   = @matricula_professor,
            prof_dateNasc    = @data_nascimento,
            fk_cidade        = @fk_cidade,
            prof_cep         = @CEP,
            prof_logradouro  = @logradouro,
            prof_casaNum     = @num_endereco,
            prof_bairro      = @bairro
        WHERE idProf = @id;
    END;`,

    // sp_ExcluirProfessor
    `CREATE PROCEDURE sp_ExcluirProfessor
        @id INT
    AS
    BEGIN
        SET NOCOUNT ON;
        IF EXISTS (SELECT 1 FROM leciona WHERE fk_professor = @id)
        BEGIN
            RAISERROR('Nao e possivel excluir: professor possui disciplinas vinculadas.', 16, 1);
            RETURN;
        END
        DELETE FROM professor WHERE idProf = @id;
    END;`,

    // sp_InserirAluno
    `CREATE PROCEDURE sp_InserirAluno
        @nome             VARCHAR(100),
        @data_nasc        DATE,
        @CPF              VARCHAR(14),
        @matricula_aluno  INT,
        @email            VARCHAR(50),
        @celular          VARCHAR(13),
        @uf_sigla         VARCHAR(2),
        @uf_nome          VARCHAR(20),
        @cidade           VARCHAR(50),
        @fk_turma         INT,
        @CEP              VARCHAR(9),
        @logradouro       VARCHAR(50),
        @num_endereco     INT,
        @bairro           VARCHAR(50)
    AS
    BEGIN
        SET NOCOUNT ON;

        DECLARE @fk_cidade INT;
        CREATE TABLE #tmp_cidade_aluno_ins (idCid INT);
        INSERT INTO #tmp_cidade_aluno_ins
            EXEC sp_ConferirInserirUfCidade
                @uf_sigla = @uf_sigla,
                @uf_nome  = @uf_nome,
                @cidade   = @cidade;
        SET @fk_cidade = (SELECT idCid FROM #tmp_cidade_aluno_ins);
        DROP TABLE #tmp_cidade_aluno_ins;

        IF EXISTS (SELECT 1 FROM aluno WHERE aluno_cpf = @CPF)
        BEGIN
            RAISERROR('CPF "%s" ja cadastrado para outro aluno.', 16, 1, @CPF);
            RETURN;
        END

        IF EXISTS (SELECT 1 FROM aluno WHERE aluno_matricula = @matricula_aluno)
        BEGIN
            RAISERROR('Matricula %d ja cadastrada.', 16, 1, @matricula_aluno);
            RETURN;
        END

        IF NOT EXISTS (SELECT 1 FROM turma WHERE idTurma = @fk_turma)
        BEGIN
            RAISERROR('Turma com id %d nao encontrada.', 16, 1, @fk_turma);
            RETURN;
        END

        INSERT INTO aluno
            (aluno_nome, aluno_dateNasc, aluno_cpf, aluno_matricula, aluno_email, aluno_celular,
             fk_cidade, fk_turma, aluno_cep, aluno_logradouro, aluno_casaNum, aluno_bairro)
        VALUES
            (@nome, @data_nasc, @CPF, @matricula_aluno, @email, @celular,
             @fk_cidade, @fk_turma, @CEP, @logradouro, @num_endereco, @bairro);
    END;`,

    // sp_AtualizarAluno
    `CREATE PROCEDURE sp_AtualizarAluno
        @id               INT,
        @nome             VARCHAR(100),
        @data_nasc        DATE,
        @CPF              VARCHAR(14),
        @matricula_aluno  INT,
        @email            VARCHAR(50),
        @celular          VARCHAR(13),
        @uf_sigla         VARCHAR(2),
        @uf_nome          VARCHAR(20),
        @cidade           VARCHAR(50),
        @fk_turma         INT,
        @CEP              VARCHAR(9),
        @logradouro       VARCHAR(50),
        @num_endereco     INT,
        @bairro           VARCHAR(50)
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM aluno WHERE idAluno = @id)
        BEGIN
            RAISERROR('Aluno com id %d nao encontrado.', 16, 1, @id);
            RETURN;
        END

        IF EXISTS (SELECT 1 FROM aluno WHERE aluno_CPF = @CPF AND idAluno <> @id)
        BEGIN
            RAISERROR('CPF "%s" ja cadastrado para outro aluno.', 16, 1, @CPF);
            RETURN;
        END

        DECLARE @fk_cidade INT;
        CREATE TABLE #tmp_cidade_aluno_upd (idCid INT);
        INSERT INTO #tmp_cidade_aluno_upd
            EXEC sp_ConferirInserirUfCidade
                @uf_sigla = @uf_sigla,
                @uf_nome  = @uf_nome,
                @cidade   = @cidade;
        SET @fk_cidade = (SELECT idCid FROM #tmp_cidade_aluno_upd);
        DROP TABLE #tmp_cidade_aluno_upd;

        UPDATE aluno
        SET aluno_nome       = @nome,
            aluno_dateNasc   = @data_nasc,
            aluno_cpf        = @CPF,
            aluno_matricula  = @matricula_aluno,
            aluno_email      = @email,
            aluno_celular    = @celular,
            fk_cidade        = @fk_cidade,
            fk_turma         = @fk_turma,
            aluno_cep        = @CEP,
            aluno_logradouro = @logradouro,
            aluno_casaNum    = @num_endereco,
            aluno_bairro     = @bairro
        WHERE idAluno = @id;
    END;`,

    // sp_ExcluirAluno
    `CREATE PROCEDURE sp_ExcluirAluno
        @id INT
    AS
    BEGIN
        SET NOCOUNT ON;
        DELETE FROM avaliacao WHERE fk_aluno = @id;
        DELETE FROM aluno WHERE idAluno = @id;
    END;`,

    // sp_InserirLeciona
    `CREATE PROCEDURE sp_InserirLeciona
        @fk_professor  INT,
        @fk_disciplina INT,
        @fk_turma      INT
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM professor WHERE idProf = @fk_professor)
        BEGIN
            RAISERROR('Professor com id %d nao encontrado.', 16, 1, @fk_professor);
            RETURN;
        END

        IF NOT EXISTS (SELECT 1 FROM disciplina WHERE idDisc = @fk_disciplina)
        BEGIN
            RAISERROR('Disciplina com id %d nao encontrada.', 16, 1, @fk_disciplina);
            RETURN;
        END

        IF NOT EXISTS (SELECT 1 FROM turma WHERE idTurma = @fk_turma)
        BEGIN
            RAISERROR('Turma com id %d nao encontrada.', 16, 1, @fk_turma);
            RETURN;
        END

        IF EXISTS (
            SELECT 1 FROM leciona
            WHERE fk_professor  = @fk_professor
              AND fk_disciplina = @fk_disciplina
              AND fk_turma      = @fk_turma
        )
        BEGIN
            RAISERROR('Este professor ja leciona esta disciplina nesta turma.', 16, 1);
            RETURN;
        END

        INSERT INTO leciona (fk_professor, fk_disciplina, fk_turma)
        VALUES (@fk_professor, @fk_disciplina, @fk_turma);
    END;`,

    // sp_ExcluirLeciona
    `CREATE PROCEDURE sp_ExcluirLeciona
        @id_leciona INT
    AS
    BEGIN
        SET NOCOUNT ON;
        IF EXISTS (SELECT 1 FROM avaliacao WHERE fk_leciona = @id_leciona)
        BEGIN
            RAISERROR('Nao e possivel excluir: existem avaliacoes vinculadas a esta relacao.', 16, 1);
            RETURN;
        END
        DELETE FROM leciona WHERE idLeciona = @id_leciona;
    END;`,

    // sp_InserirAvaliacao
    `CREATE PROCEDURE sp_InserirAvaliacao
        @fk_leciona INT,
        @fk_aluno   INT,
        @nota1      DECIMAL(4,1),
        @nota2      DECIMAL(4,1),
        @nota3      DECIMAL(4,1)
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM leciona WHERE idLeciona = @fk_leciona)
        BEGIN
            RAISERROR('Relacao Leciona com id %d nao encontrada.', 16, 1, @fk_leciona);
            RETURN;
        END

        IF NOT EXISTS (SELECT 1 FROM aluno WHERE idAluno = @fk_aluno)
        BEGIN
            RAISERROR('Aluno com id %d nao encontrado.', 16, 1, @fk_aluno);
            RETURN;
        END

        IF NOT EXISTS (
            SELECT 1 FROM leciona l
            INNER JOIN aluno a ON a.fk_turma = l.fk_turma
            WHERE l.idLeciona = @fk_leciona AND a.idAluno = @fk_aluno
        )
        BEGIN
            RAISERROR('O aluno nao pertence a turma desta disciplina.', 16, 1);
            RETURN;
        END

        IF EXISTS (
            SELECT 1 FROM avaliacao
            WHERE fk_leciona = @fk_leciona AND fk_aluno = @fk_aluno
        )
        BEGIN
            RAISERROR('Ja existe avaliacao para este aluno. Use sp_AtualizarAvaliacao.', 16, 1);
            RETURN;
        END

        IF @nota1 < 0 OR @nota1 > 10 OR @nota2 < 0 OR @nota2 > 10 OR @nota3 < 0 OR @nota3 > 10
        BEGIN
            RAISERROR('Notas devem estar entre 0 e 10.', 16, 1);
            RETURN;
        END

        INSERT INTO avaliacao (fk_leciona, fk_aluno, avali_nota1, avali_nota2, avali_nota3)
        VALUES (@fk_leciona, @fk_aluno, @nota1, @nota2, @nota3);
    END;`,

    // sp_AtualizarAvaliacao
    `CREATE PROCEDURE sp_AtualizarAvaliacao
        @id_avaliacao INT,
        @nota1        DECIMAL(4,1),
        @nota2        DECIMAL(4,1),
        @nota3        DECIMAL(4,1)
    AS
    BEGIN
        SET NOCOUNT ON;

        IF NOT EXISTS (SELECT 1 FROM avaliacao WHERE idAvaliacao = @id_avaliacao)
        BEGIN
            RAISERROR('Avaliacao com id %d nao encontrada.', 16, 1, @id_avaliacao);
            RETURN;
        END

        IF @nota1 < 0 OR @nota1 > 10 OR @nota2 < 0 OR @nota2 > 10 OR @nota3 < 0 OR @nota3 > 10
        BEGIN
            RAISERROR('Notas devem estar entre 0 e 10.', 16, 1);
            RETURN;
        END

        UPDATE avaliacao
        SET avali_nota1 = @nota1,
            avali_nota2 = @nota2,
            avali_nota3 = @nota3
        WHERE idAvaliacao = @id_avaliacao;
    END;`,

    // sp_ExcluirAvaliacao
    `CREATE PROCEDURE sp_ExcluirAvaliacao
        @id_avaliacao INT
    AS
    BEGIN
        SET NOCOUNT ON;
        DELETE FROM avaliacao WHERE idAvaliacao = @id_avaliacao;
    END;`,

    // sp_NotasMediaPorAluno
    `CREATE PROCEDURE sp_NotasMediaPorAluno
        @fk_aluno INT
    AS
    BEGIN
        SET NOCOUNT ON;
        SELECT
            a.aluno_nome                                                        AS Aluno,
            d.disc_nome                                                         AS Disciplina,
            t.turma_nome                                                        AS Turma,
            av.avali_nota1,
            av.avali_nota2,
            av.avali_nota3,
            ROUND((av.avali_nota1 + av.avali_nota2 + av.avali_nota3) / 3.0, 1) AS Media,
            CASE
                WHEN (av.avali_nota1 + av.avali_nota2 + av.avali_nota3) / 3.0 >= 7 THEN 'APROVADO'
                ELSE 'REPROVADO'
            END AS Situacao
        FROM avaliacao av
        INNER JOIN aluno      a ON a.idAluno   = av.fk_aluno
        INNER JOIN leciona    l ON l.idLeciona = av.fk_leciona
        INNER JOIN disciplina d ON d.idDisc    = l.fk_disciplina
        INNER JOIN turma      t ON t.idTurma   = l.fk_turma
        WHERE av.fk_aluno = @fk_aluno
        ORDER BY d.disc_nome;
    END;`,

    // sp_NotasDaTurma
    `CREATE PROCEDURE sp_NotasDaTurma
        @fk_turma      INT,
        @fk_disciplina INT = NULL
    AS
    BEGIN
        SET NOCOUNT ON;
        SELECT
            t.turma_nome                                                        AS Turma,
            d.disc_nome                                                         AS Disciplina,
            a.aluno_nome                                                        AS Aluno,
            av.avali_nota1,
            av.avali_nota2,
            av.avali_nota3,
            ROUND((av.avali_nota1 + av.avali_nota2 + av.avali_nota3) / 3.0, 1) AS Media,
            CASE
                WHEN (av.avali_nota1 + av.avali_nota2 + av.avali_nota3) / 3.0 >= 7 THEN 'APROVADO'
                ELSE 'REPROVADO'
            END AS Situacao
        FROM avaliacao av
        INNER JOIN aluno      a ON a.idAluno   = av.fk_aluno
        INNER JOIN leciona    l ON l.idLeciona = av.fk_leciona
        INNER JOIN disciplina d ON d.idDisc    = l.fk_disciplina
        INNER JOIN turma      t ON t.idTurma   = l.fk_turma
        WHERE l.fk_turma = @fk_turma
          AND (@fk_disciplina IS NULL OR l.fk_disciplina = @fk_disciplina)
        ORDER BY d.disc_nome, a.aluno_nome;
    END;`,

    // sp_AlunosDaTurma
    `CREATE PROCEDURE sp_AlunosDaTurma
        @fk_turma INT
    AS
    BEGIN
        SET NOCOUNT ON;
        SELECT
            a.aluno_matricula,
            a.aluno_nome,
            a.aluno_email,
            a.aluno_celular,
            c.cid_nome AS Cidade
        FROM aluno a
        INNER JOIN cidade c ON c.idCid = a.fk_cidade
        WHERE a.fk_turma = @fk_turma
        ORDER BY a.aluno_nome;
    END;`,

    // sp_AprovacaoPorDisciplinaTurma
    `CREATE PROCEDURE sp_AprovacaoPorDisciplinaTurma
        @fk_disciplina INT = NULL,
        @fk_turma      INT = NULL
    AS
    BEGIN
        SET NOCOUNT ON;
        SELECT
            t.turma_nome                                                        AS Turma,
            d.disc_nome                                                         AS Disciplina,
            a.aluno_nome                                                        AS Aluno,
            ROUND((av.avali_nota1 + av.avali_nota2 + av.avali_nota3) / 3.0, 1) AS Media,
            CASE
                WHEN (av.avali_nota1 + av.avali_nota2 + av.avali_nota3) / 3.0 >= 7 THEN 'APROVADO'
                ELSE 'REPROVADO'
            END AS Situacao
        FROM avaliacao av
        INNER JOIN aluno      a ON a.idAluno   = av.fk_aluno
        INNER JOIN leciona    l ON l.idLeciona = av.fk_leciona
        INNER JOIN disciplina d ON d.idDisc    = l.fk_disciplina
        INNER JOIN turma      t ON t.idTurma   = l.fk_turma
        WHERE (@fk_disciplina IS NULL OR l.fk_disciplina = @fk_disciplina)
          AND (@fk_turma      IS NULL OR l.fk_turma      = @fk_turma)
        ORDER BY t.turma_nome, d.disc_nome,
                 CASE WHEN (av.avali_nota1+av.avali_nota2+av.avali_nota3)/3.0 >= 7 THEN 0 ELSE 1 END,
                 a.aluno_nome;
    END;`,

    // sp_DisciplinasPorProfessor
    `CREATE PROCEDURE sp_DisciplinasPorProfessor
        @fk_professor INT
    AS
    BEGIN
        SET NOCOUNT ON;
        SELECT
            p.prof_nome  AS Professor,
            d.disc_nome  AS Disciplina,
            t.turma_nome AS Turma,
            t.turma_ano  AS Ano
        FROM leciona l
        INNER JOIN professor  p ON p.idProf  = l.fk_professor
        INNER JOIN disciplina d ON d.idDisc  = l.fk_disciplina
        INNER JOIN turma      t ON t.idTurma = l.fk_turma
        WHERE l.fk_professor = @fk_professor
        ORDER BY d.disc_nome, t.turma_nome;
    END;`,

    // ==========================================
    // 3. TRIGGERS
    // ==========================================

    // trg_validar_notas
    `CREATE TRIGGER trg_validar_notas
    ON avaliacao
    INSTEAD OF INSERT
    AS
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM inserted
            WHERE
                avali_nota1 < 0 OR avali_nota1 > 10 OR
                avali_nota2 < 0 OR avali_nota2 > 10 OR
                avali_nota3 < 0 OR avali_nota3 > 10
        )
        BEGIN
            RAISERROR('Erro: As notas devem estar entre 0 e 10.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        INSERT INTO avaliacao
        (avali_nota1, avali_nota2, avali_nota3, fk_aluno, fk_leciona)
        SELECT
            avali_nota1,
            avali_nota2,
            avali_nota3,
            fk_aluno,
            fk_leciona
        FROM inserted;
    END;`,

    // trg_validar_idade_aluno
    `CREATE TRIGGER trg_validar_idade_aluno
    ON aluno
    INSTEAD OF INSERT
    AS
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM inserted
            WHERE DATEDIFF(YEAR, aluno_dateNasc, GETDATE()) < 5
        )
        BEGIN
            RAISERROR('Erro: O aluno deve possuir pelo menos 5 anos.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        INSERT INTO aluno
        (
            aluno_nome,
            aluno_matricula,
            aluno_cpf,
            aluno_dateNasc,
            aluno_email,
            aluno_celular,
            aluno_cep,
            aluno_bairro,
            aluno_casaNum,
            aluno_logradouro,
            aluno_complemento,
            aluno_status,
            fk_cidade,
            fk_turma
        )
        SELECT
            aluno_nome,
            aluno_matricula,
            aluno_cpf,
            aluno_dateNasc,
            aluno_email,
            aluno_celular,
            aluno_cep,
            aluno_bairro,
            aluno_casaNum,
            aluno_logradouro,
            aluno_complemento,
            aluno_status,
            fk_cidade,
            fk_turma
        FROM inserted;
    END;`,

    // trg_validar_idade_professor
    `CREATE TRIGGER trg_validar_idade_professor
    ON professor
    INSTEAD OF INSERT
    AS
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM inserted
            WHERE DATEDIFF(YEAR, prof_dateNasc, GETDATE()) < 18
        )
        BEGIN
            RAISERROR('Erro: O professor deve possuir pelo menos 18 anos.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        INSERT INTO professor
        (
            prof_nome,
            prof_matricula,
            prof_cpf,
            prof_dateNasc,
            prof_email,
            prof_celular,
            prof_cep,
            prof_bairro,
            prof_casaNum,
            prof_logradouro,
            prof_complemento,
            prof_status,
            fk_cidade
        )
        SELECT
            prof_nome,
            prof_matricula,
            prof_cpf,
            prof_dateNasc,
            prof_email,
            prof_celular,
            prof_cep,
            prof_bairro,
            prof_casaNum,
            prof_logradouro,
            prof_complemento,
            prof_status,
            fk_cidade
        FROM inserted;
    END;`,

    // trg_validar_leciona
    `CREATE TRIGGER trg_validar_leciona
    ON leciona
    INSTEAD OF INSERT
    AS
    BEGIN
        IF EXISTS (
            SELECT 1
            FROM leciona l
            INNER JOIN inserted i
            ON l.fk_professor = i.fk_professor
            AND l.fk_disciplina = i.fk_disciplina
            AND l.fk_turma = i.fk_turma
        )
        BEGIN
            RAISERROR('Erro: Professor já vinculado nesta disciplina e turma.', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        INSERT INTO leciona
        (fk_professor, fk_disciplina, fk_turma)
        SELECT
            fk_professor,
            fk_disciplina,
            fk_turma
        FROM inserted;
    END;`,
    // trg_AtualizarMedia
    `CREATE TRIGGER trg_AtualizarMedia
    ON avaliacao
    FOR INSERT, UPDATE
    AS
    BEGIN
        SET NOCOUNT ON;

        UPDATE av
        SET avali_media = ROUND((i.avali_nota1 + i.avali_nota2 + i.avali_nota3) / 3.0, 1)
        FROM avaliacao av
        INNER JOIN inserted i ON av.idAvaliacao = i.idAvaliacao
        WHERE i.avali_nota1 IS NOT NULL
          AND i.avali_nota2 IS NOT NULL
          AND i.avali_nota3 IS NOT NULL;
    END;`,

    // ==========================================
    // 4. DADOS INICIAIS (SEED)
    // ==========================================

    // Carga de UFs
    `INSERT INTO uf (uf_sigla, uf_nome) VALUES 
    ('AC', 'Acre'), ('AL', 'Alagoas'), ('AP', 'Amapá'), ('AM', 'Amazonas'), ('BA', 'Bahia'),
    ('CE', 'Ceará'), ('DF', 'Distrito Federal'), ('ES', 'Espírito Santo'), ('GO', 'Goiás'),
    ('MA', 'Maranhão'), ('MT', 'Mato Grosso'), ('MS', 'Mato Grosso do Sul'), ('MG', 'Minas Gerais'),
    ('PA', 'Pará'), ('PB', 'Paraíba'), ('PR', 'Paraná'), ('PE', 'Pernambuco'), ('PI', 'Piauí'),
    ('RJ', 'Rio de Janeiro'), ('RN', 'Rio Grande do Norte'), ('RS', 'Rio Grande do Sul'),
    ('RO', 'Rondônia'), ('RR', 'Roraima'), ('SC', 'Santa Catarina'), ('SP', 'São Paulo'),
    ('SE', 'Sergipe'), ('TO', 'Tocantins');`,

    // Carga de Cidades
    `INSERT INTO cidade (cid_nome, fk_uf) VALUES 
    ('Rio Branco', (SELECT idUf FROM uf WHERE uf_sigla = 'AC')),
    ('Maceió', (SELECT idUf FROM uf WHERE uf_sigla = 'AL')),
    ('Macapá', (SELECT idUf FROM uf WHERE uf_sigla = 'AP')),
    ('Manaus', (SELECT idUf FROM uf WHERE uf_sigla = 'AM')),
    ('Salvador', (SELECT idUf FROM uf WHERE uf_sigla = 'BA')),
    ('Fortaleza', (SELECT idUf FROM uf WHERE uf_sigla = 'CE')),
    ('Brasília', (SELECT idUf FROM uf WHERE uf_sigla = 'DF')),
    ('Vitória', (SELECT idUf FROM uf WHERE uf_sigla = 'ES')),
    ('Vila Velha', (SELECT idUf from uf where uf_sigla = 'ES')),
    ('Cariacica', (SELECT idUf from uf where uf_sigla = 'ES')),
    ('Guarapari', (SELECT idUf from uf where uf_sigla = 'ES')),
    ('Serra', (SELECT idUf from uf where uf_sigla = 'ES')),
    ('Fundão', (SELECT idUf from uf where uf_sigla = 'ES')),
    ('Goiânia', (SELECT idUf FROM uf WHERE uf_sigla = 'GO')),
    ('São Luís', (SELECT idUf FROM uf WHERE uf_sigla = 'MA')),
    ('Cuiabá', (SELECT idUf FROM uf WHERE uf_sigla = 'MT')),
    ('Campo Grande', (SELECT idUf FROM uf WHERE uf_sigla = 'MS')),
    ('Belo Horizonte', (SELECT idUf FROM uf WHERE uf_sigla = 'MG')),
    ('Belém', (SELECT idUf FROM uf WHERE uf_sigla = 'PA')),
    ('João Pessoa', (SELECT idUf FROM uf WHERE uf_sigla = 'PB')),
    ('Curitiba', (SELECT idUf FROM uf WHERE uf_sigla = 'PR')),
    ('Recife', (SELECT idUf FROM uf WHERE uf_sigla = 'PE')),
    ('Teresina', (SELECT idUf FROM uf WHERE uf_sigla = 'PI')),
    ('Rio de Janeiro', (SELECT idUf FROM uf WHERE uf_sigla = 'RJ')),
    ('Natal', (SELECT idUf FROM uf WHERE uf_sigla = 'RN')),
    ('Porto Alegre', (SELECT idUf FROM uf WHERE uf_sigla = 'RS')),
    ('Porto Velho', (SELECT idUf FROM uf WHERE uf_sigla = 'RO')),
    ('Boa Vista', (SELECT idUf FROM uf WHERE uf_sigla = 'RR')),
    ('Florianópolis', (SELECT idUf FROM uf WHERE uf_sigla = 'SC')),
    ('São Paulo', (SELECT idUf FROM uf WHERE uf_sigla = 'SP')),
    ('Aracaju', (SELECT idUf FROM uf WHERE uf_sigla = 'SE')),
    ('Palmas', (SELECT idUf FROM uf WHERE uf_sigla = 'TO'));`,

    // Carga de Turmas
    `INSERT INTO turma (turma_nome, turma_ano) VALUES 
    ('1º M1', 2026),
    ('2º M1', 2026),
    ('3º M1', 2026);`,

    // Carga de Professores
    `INSERT INTO professor
    (prof_nome, prof_matricula, prof_cpf, prof_dateNasc, prof_email, prof_celular,
     prof_cep, prof_bairro, prof_casaNum, prof_logradouro, prof_complemento, fk_cidade)
    VALUES
    ('Carlos Henrique Almeida', 1001, '123.456.789-10', '1980-03-15', 'carlos.almeida@escolaabc.com', '27999990001', '29100-000', 'Centro', 120, 'Rua das Flores', 'Apto 101', 1),
    ('Mariana Souza Ribeiro', 1002, '234.567.891-11', '1985-07-20', 'mariana.ribeiro@escolaabc.com', '27999990002', '29100-010', 'Praia da Costa', 45, 'Avenida Atlântica', 'Casa', 1),
    ('Ricardo Lima Ferreira', 1003, '345.678.912-12', '1978-11-02', 'ricardo.ferreira@escolaabc.com', '27999990003', '29100-020', 'Itapuã', 300, 'Rua do Sol', 'Próximo ao mercado', 1),
    ('Fernanda Oliveira Santos', 1004, '456.789.123-13', '1990-01-10', 'fernanda.santos@escolaabc.com', '27999990004', '29100-030', 'Jardim da Penha', 88, 'Rua das Palmeiras', 'Apto 202', 1),
    ('João Pedro Martins', 1005, '567.891.234-14', '1982-05-25', 'joao.martins@escolaabc.com', '27999990005', '29100-040', 'Glória', 12, 'Rua da Escola', 'Casa', 1),
    ('Patrícia Gomes Silva', 1006, '678.912.345-15', '1987-09-13', 'patricia.silva@escolaabc.com', '27999990006', '29100-050', 'Praia do Canto', 510, 'Avenida Brasil', 'Bloco B', 1),
    ('Eduardo Vieira Costa', 1007, '789.123.456-16', '1975-12-30', 'eduardo.costa@escolaabc.com', '27999990007', '29100-060', 'Centro', 77, 'Rua Dom Pedro', 'Sala 3', 1),
    ('Ana Cláudia Pereira', 1008, '891.234.567-17', '1992-08-18', 'ana.pereira@escolaabc.com', '27999990008', '29100-070', 'Coqueiral', 205, 'Rua Santa Luzia', 'Casa', 1),
    ('Bruno Rodrigues Teixeira', 1009, '912.345.678-18', '1983-04-05', 'bruno.teixeira@escolaabc.com', '27999990009', '29100-080', 'Boa Vista', 99, 'Rua do Comércio', 'Fundos', 1),
    ('Juliana Mendes Rocha', 1010, '987.654.321-19', '1988-06-22', 'juliana.rocha@escolaabc.com', '27999990010', '29100-090', 'Itaparica', 150, 'Avenida Vitória', 'Apto 303', 1);`,

    // Carga de Alunos
    `INSERT INTO aluno
    (aluno_nome, aluno_matricula, aluno_cpf, aluno_dateNasc, aluno_email, aluno_celular,
     aluno_cep, aluno_bairro, aluno_casaNum, aluno_logradouro, aluno_complemento, fk_cidade, fk_turma)
    VALUES
    ('Lucas Henrique Silva', 2001, '111.222.333-44', '2009-05-12', 'lucas.silva@aluno.escolaabc.com', '27999991001', '29100-100', 'Centro', 15, 'Rua das Acácias', 'Casa', 1, 1),
    ('Maria Eduarda Santos', 2002, '222.333.444-55', '2009-09-20', 'maria.santos@aluno.escolaabc.com', '27999991002', '29100-110', 'Praia da Costa', 220, 'Avenida Oceânica', 'Apto 102', 1, 1),
    ('João Pedro Almeida', 2003, '333.444.555-66', '2008-02-18', 'joao.almeida@aluno.escolaabc.com', '27999991003', '29100-120', 'Itapuã', 98, 'Rua do Sol', 'Fundos', 1, 2),
    ('Ana Clara Ribeiro', 2004, '444.555.666-77', '2008-06-30', 'ana.ribeiro@aluno.escolaabc.com', '27999991004', '29100-130', 'Jardim da Penha', 40, 'Rua das Palmeiras', 'Casa', 1, 2),
    ('Gabriel Martins Costa', 2005, '555.666.777-88', '2007-03-05', 'gabriel.costa@aluno.escolaabc.com', '27999991005', '29100-140', 'Glória', 55, 'Rua da Escola', 'Apto 201', 1, 3),
    ('Beatriz Oliveira Mendes', 2006, '666.777.888-99', '2007-10-22', 'beatriz.mendes@aluno.escolaabc.com', '27999991006', '29100-150', 'Praia do Canto', 77, 'Avenida Brasil', 'Bloco C', 1, 3),
    ('Rafael Souza Ferreira', 2007, '777.888.999-00', '2009-01-15', 'rafael.ferreira@aluno.escolaabc.com', '27999991007', '29100-160', 'Coqueiral', 12, 'Rua Santa Luzia', 'Casa', 1, 1),
    ('Isabela Rodrigues Lima', 2008, '888.999.000-11', '2008-08-08', 'isabela.lima@aluno.escolaabc.com', '27999991008', '29100-170', 'Boa Vista', 150, 'Rua do Comércio', 'Casa', 1, 2),
    ('Pedro Augusto Vieira', 2009, '999.000.111-22', '2007-04-14', 'pedro.vieira@aluno.escolaabc.com', '27999991009', '29100-180', 'Itaparica', 33, 'Avenida Vitória', 'Apto 303', 1, 3),
    ('Larissa Gomes Teixeira', 2010, '101.202.303-44', '2009-12-02', 'larissa.teixeira@aluno.escolaabc.com', '27999991010', '29100-190', 'Centro', 10, 'Rua Dom Pedro', 'Casa', 1, 1);`,

    // Carga de Disciplinas
    `INSERT INTO disciplina (disc_nome, disc_descricao) VALUES 
    ('Português', 'Língua Portuguesa e Literatura'),
    ('Matemática', 'Matemática básica e aplicada'),
    ('História', 'História do Brasil e Geral');`,

    // Carga de Leciona (corrigida com fk_professor e fk_disciplina)
    `INSERT INTO leciona (fk_professor, fk_disciplina, fk_turma) VALUES 
    (1, 1, 1), -- Português 1º ano
    (2, 2, 1), -- Matemática 1º ano
    (3, 3, 1), -- História 1º ano
    (4, 1, 2), -- Português 2º ano
    (5, 2, 2), -- Matemática 2º ano
    (6, 3, 2), -- História 2º ano
    (7, 1, 3), -- Português 3º ano
    (8, 2, 3), -- Matemática 3º ano
    (9, 3, 3); -- História 3º ano`,

    // Carga de Avaliações
    `INSERT INTO avaliacao (avali_nota1, avali_nota2, avali_nota3, fk_aluno, fk_leciona) VALUES 
    -- 1º ANO
    (7.5, 8.0, 9.0, 1, 1),
    (6.0, 7.0, 6.5, 1, 2),
    (8.0, 8.5, 7.5, 1, 3),
    (9.0, 8.5, 9.5, 2, 1),
    (7.0, 7.5, 8.0, 2, 2),
    (6.5, 7.0, 7.5, 2, 3),
    (5.0, 6.0, 6.5, 7, 1),
    (4.5, 5.5, 6.0, 7, 2),
    (6.0, 6.5, 7.0, 7, 3),
    (8.5, 8.0, 8.0, 10, 1),
    (7.0, 6.5, 7.5, 10, 2),
    (7.5, 8.0, 8.5, 10, 3),
    -- 2º ANO
    (6.5, 7.0, 7.5, 3, 4),
    (8.0, 8.5, 9.0, 3, 5),
    (7.0, 6.5, 7.5, 3, 6),
    (9.0, 9.5, 10.0, 4, 4),
    (7.5, 8.0, 8.5, 4, 5),
    (8.5, 8.0, 8.0, 4, 6),
    (5.5, 6.0, 6.5, 8, 4),
    (6.0, 6.5, 7.0, 8, 5),
    (7.0, 7.5, 7.0, 8, 6),
    -- 3º ANO
    (8.0, 8.5, 9.0, 5, 7),
    (6.5, 7.0, 7.5, 5, 8),
    (7.0, 7.5, 8.0, 5, 9),
    (9.0, 9.0, 9.5, 6, 7),
    (8.0, 8.5, 9.0, 6, 8),
    (7.5, 8.0, 8.5, 6, 9),
    (6.0, 6.5, 7.0, 9, 7),
    (5.5, 6.0, 6.5, 9, 8),
    (7.0, 7.5, 7.0, 9, 9);`
];

async function setupDatabase() {
    let pool;
    try {
        console.log('Conectando ao SQL Server (banco master)...');
        pool = await sql.connect(dbConfig);

        // 1. Se o banco de dados já existir, removemos para recriar do zero com a nova estrutura
        console.log(`Verificando se o banco de dados "${targetDatabase}" existe...`);
        const dbCheckResult = await pool.request().query(
            `SELECT database_id FROM sys.databases WHERE name = '${targetDatabase}'`
        );

        if (dbCheckResult.recordset.length > 0) {
            console.log(`Banco de dados "${targetDatabase}" já existe. Removendo para recriar do zero...`);
            // Força a desconexão de usuários/processos ativos para permitir o DROP
            await pool.request().query(`ALTER DATABASE ${targetDatabase} SET SINGLE_USER WITH ROLLBACK IMMEDIATE`);
            await pool.request().query(`DROP DATABASE ${targetDatabase}`);
            console.log(`Banco de dados "${targetDatabase}" removido com sucesso.`);
        }

        console.log(`Criando banco de dados "${targetDatabase}"...`);
        await pool.request().query(`CREATE DATABASE ${targetDatabase}`);
        console.log(`Banco de dados "${targetDatabase}" criado com sucesso!`);

        // Fechar conexão com o banco master
        await pool.close();

        // 2. Conectar diretamente ao banco EscolaABC para criar as tabelas
        console.log(`Conectando ao banco "${targetDatabase}" para criar as tabelas...`);
        const appDbConfig = { ...dbConfig, database: targetDatabase };
        pool = await sql.connect(appDbConfig);

        // Executar as queries uma por uma na ordem correta
        for (let i = 0; i < queries.length; i++) {
            console.log(`Executando query ${i + 1} de ${queries.length}...`);
            await pool.request().query(queries[i]);
        }

        console.log('Todas as novas tabelas foram configuradas com sucesso!');

    } catch (err) {
        console.error('Ocorreu um erro durante a configuração do banco de dados:', err);
    } finally {
        if (pool) {
            try {
                await pool.close();
                console.log('Conexão encerrada.');
            } catch (closeErr) {
                console.error('Erro ao fechar a conexão:', closeErr);
            }
        }
    }
}

setupDatabase();
