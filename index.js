const express = require('express');
const sql = require('mssql');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'senha123',
    server: process.env.DB_SERVER || 'localhost',
    database: 'EscolaABC', // Nome do seu banco de dados
    options: {
        encrypt: false,
        trustServerCertificate: true,
        instanceName: 'SQLEXPRESS'
    }
};

// Configura o EJS como view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware para servir arquivos estáticos (css, imagens, etc.)
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para analisar o corpo das requisições (formulários, json)
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Rota principal
app.get('/', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query(`
            SELECT 
                (SELECT COUNT(*) FROM aluno) AS totalAlunos,
                (SELECT COUNT(*) FROM professor) AS totalProfessores,
                (SELECT COUNT(*) FROM turma WHERE turma_ano = YEAR(GETDATE())) AS totalTurmas
        `);
        const { totalAlunos, totalProfessores, totalTurmas } = result.recordset[0];
        res.render('home', { 
            activeMenu: 'dashboard',
            totalAlunos: totalAlunos,
            totalProfessores: totalProfessores,
            totalTurmas: totalTurmas
        });
    } catch (err) {
        console.error('Erro ao buscar métricas do dashboard:', err);
        res.render('home', { 
            activeMenu: 'dashboard',
            totalAlunos: 'N/A',
            totalProfessores: 'N/A',
            totalTurmas: 'N/A'
        });
    } finally {
        sql.close();
    }
});

// Rota de login
app.get('/login', (req, res) => {
    res.render('login');
});

// Rota de Alunos
app.get('/alunos', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query('SELECT COUNT(*) AS total FROM aluno');
        const totalAlunos = result.recordset[0].total;
        res.render('gestao_alunos', { 
            activeMenu: 'alunos',
            totalAlunos: totalAlunos
        });
    } catch (err) {
        console.error('Erro ao buscar total de alunos:', err);
        res.render('gestao_alunos', { 
            activeMenu: 'alunos',
            totalAlunos: 0
        });
    } finally {
        sql.close();
    }
});

// API para listar, filtrar e paginar alunos
app.get('/api/alunos', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const nome = req.query.nome || '';
        const matricula = req.query.matricula || '';
        const limit = 100;
        const offset = (page - 1) * limit;

        await sql.connect(dbConfig);
        const request = new sql.Request();
        request.input('nome', sql.VarChar, nome);
        request.input('matricula', sql.VarChar, matricula);
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const countResult = await request.query(`
            SELECT COUNT(*) AS total
            FROM aluno a
            WHERE (@nome = '' OR a.aluno_nome LIKE '%' + @nome + '%')
              AND (@matricula = '' OR CAST(a.aluno_matricula AS VARCHAR) LIKE '%' + @matricula + '%')
        `);
        const totalAlunos = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalAlunos / limit) || 1;

        const listResult = await request.query(`
            SELECT a.aluno_matricula, a.aluno_nome, a.aluno_status, t.turma_nome
            FROM aluno a
            LEFT JOIN turma t ON a.fk_turma = t.idTurma
            WHERE (@nome = '' OR a.aluno_nome LIKE '%' + @nome + '%')
              AND (@matricula = '' OR CAST(a.aluno_matricula AS VARCHAR) LIKE '%' + @matricula + '%')
            ORDER BY a.aluno_nome
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `);

        res.json({
            alunos: listResult.recordset,
            totalAlunos: totalAlunos,
            currentPage: page,
            totalPages: totalPages
        });
    } catch (err) {
        console.error('Erro na API de alunos:', err);
        res.status(500).json({ error: 'Erro ao buscar alunos do banco de dados' });
    } finally {
        sql.close();
    }
});


// Rota de Criar Aluno
app.get('/alunos/novo', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query('SELECT idTurma, turma_nome FROM turma ORDER BY turma_nome');
        res.render('criar_aluno', { 
            activeMenu: 'alunos',
            turmas: result.recordset
        });
    } catch (err) {
        console.error('Erro ao buscar turmas para o cadastro:', err);
        res.render('criar_aluno', { 
            activeMenu: 'alunos',
            turmas: []
        });
    } finally {
        sql.close();
    }
});

// Rota para cadastrar aluno por meio da procedure sp_InserirAluno
app.post('/alunos/novo', async (req, res) => {
    try {
        const {
            nome,
            data_nasc,
            CPF,
            matricula_aluno,
            email,
            celular,
            uf_sigla,
            cidade,
            fk_turma,
            CEP,
            logradouro,
            num_endereco,
            bairro
        } = req.body;

        // Validação simples de obrigatoriedade
        if (!nome || !data_nasc || !CPF || !matricula_aluno || !email || !celular || !uf_sigla || !cidade || !fk_turma || !CEP || !logradouro || !num_endereco || !bairro) {
            return res.status(400).json({ success: false, error: 'Todos os campos são obrigatórios.' });
        }

        // Mapeamento das siglas de UF para os nomes completos
        const ufNames = {
            'AC': 'Acre', 'AL': 'Alagoas', 'AP': 'Amapá', 'AM': 'Amazonas', 'BA': 'Bahia',
            'CE': 'Ceará', 'DF': 'Distrito Federal', 'ES': 'Espírito Santo', 'GO': 'Goiás',
            'MA': 'Maranhão', 'MT': 'Mato Grosso', 'MS': 'Mato Grosso do Sul', 'MG': 'Minas Gerais',
            'PA': 'Pará', 'PB': 'Paraíba', 'PR': 'Paraná', 'PE': 'Pernambuco', 'PI': 'Piauí',
            'RJ': 'Rio de Janeiro', 'RN': 'Rio Grande do Norte', 'RS': 'Rio Grande do Sul',
            'RO': 'Rondônia', 'RR': 'Roraima', 'SC': 'Santa Catarina', 'SP': 'São Paulo',
            'SE': 'Sergipe', 'TO': 'Tocantins'
        };

        const ufSiglaUpper = uf_sigla.toUpperCase();
        const ufNomeCompleto = ufNames[ufSiglaUpper] || 'Estado Desconhecido';

        // Sanitização e formatação dos tipos de dados de acordo com a procedure
        // Limpar telefone celular (remover parênteses, espaços e traços) e garantir tamanho máximo de 13 caracteres
        let celClean = celular.replace(/\D/g, ''); // Apenas números
        if (celClean.length > 13) {
            celClean = celClean.substring(0, 13);
        }

        // Garantir CEP de tamanho máximo 9
        let cepClean = CEP.trim().substring(0, 9);

        // Conversão de números inteiros
        const matriculaVal = parseInt(matricula_aluno, 10);
        const fkTurmaVal = parseInt(fk_turma, 10);
        const numEnderecoVal = parseInt(num_endereco, 10);

        if (isNaN(matriculaVal)) {
            return res.status(400).json({ success: false, error: 'O número de matrícula deve ser um valor numérico.' });
        }
        if (isNaN(fkTurmaVal)) {
            return res.status(400).json({ success: false, error: 'A turma selecionada é inválida.' });
        }
        if (isNaN(numEnderecoVal)) {
            return res.status(400).json({ success: false, error: 'O número do endereço deve ser um valor numérico.' });
        }

        await sql.connect(dbConfig);
        const request = new sql.Request();
        
        request.input('nome', sql.VarChar(100), nome.trim());
        request.input('data_nasc', sql.Date, new Date(data_nasc));
        request.input('CPF', sql.VarChar(14), CPF.trim());
        request.input('matricula_aluno', sql.Int, matriculaVal);
        request.input('email', sql.VarChar(50), email.trim());
        request.input('celular', sql.VarChar(13), celClean);
        request.input('uf_sigla', sql.VarChar(2), ufSiglaUpper);
        request.input('uf_nome', sql.VarChar(20), ufNomeCompleto);
        request.input('cidade', sql.VarChar(50), cidade.trim());
        request.input('fk_turma', sql.Int, fkTurmaVal);
        request.input('CEP', sql.VarChar(9), cepClean);
        request.input('logradouro', sql.VarChar(50), logradouro.trim());
        request.input('num_endereco', sql.Int, numEnderecoVal);
        request.input('bairro', sql.VarChar(50), bairro.trim());

        await request.execute('sp_InserirAluno');

        res.json({ success: true, message: 'Aluno cadastrado com sucesso!' });
    } catch (err) {
        console.error('Erro ao cadastrar aluno pela procedure sp_InserirAluno:', err);
        // Retorna a mensagem de erro que vem do banco de dados (por exemplo, erros do RAISERROR)
        res.status(500).json({ success: false, error: err.message || 'Erro interno ao cadastrar aluno no banco de dados.' });
    } finally {
        sql.close();
    }
});

// Rota de Notas
app.get('/notas', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const turmasResult = await sql.query('SELECT idTurma, turma_nome, turma_ano FROM turma ORDER BY turma_nome');
        const disciplinasResult = await sql.query('SELECT idDisc, disc_nome FROM disciplina ORDER BY disc_nome');
        res.render('notas', { 
            activeMenu: 'notas',
            turmas: turmasResult.recordset,
            disciplinas: disciplinasResult.recordset
        });
    } catch (err) {
        console.error('Erro ao carregar dados da página de notas:', err);
        res.render('notas', { 
            activeMenu: 'notas',
            turmas: [],
            disciplinas: []
        });
    } finally {
        sql.close();
    }
});

// API para carregar notas por turma e disciplina
app.get('/api/notas', async (req, res) => {
    try {
        const idTurma = parseInt(req.query.idTurma);
        const idDisc = parseInt(req.query.idDisc);

        if (isNaN(idTurma) || isNaN(idDisc)) {
            return res.status(400).json({ error: 'Turma e Disciplina são obrigatórias.' });
        }

        await sql.connect(dbConfig);
        const request = new sql.Request();
        request.input('idTurma', sql.Int, idTurma);
        request.input('idDisc', sql.Int, idDisc);

        // Busca todos os alunos daquela turma, e junta com leciona e avaliacao se houver.
        const query = `
            SELECT 
                a.idAluno,
                a.aluno_nome,
                a.aluno_matricula,
                a.aluno_status,
                l.idLeciona,
                av.idAvaliacao,
                av.avali_nota1,
                av.avali_nota2,
                av.avali_nota3,
                av.avali_media
            FROM aluno a
            LEFT JOIN leciona l ON l.fk_turma = a.fk_turma AND l.fk_disciplina = @idDisc
            LEFT JOIN avaliacao av ON av.fk_aluno = a.idAluno AND av.fk_leciona = l.idLeciona
            WHERE a.fk_turma = @idTurma
            ORDER BY a.aluno_nome;
        `;
        const result = await request.query(query);

        res.json({
            sucesso: true,
            alunos: result.recordset
        });
    } catch (err) {
        console.error('Erro na API de consulta de notas:', err);
        res.status(500).json({ error: 'Erro ao consultar notas do banco de dados.' });
    } finally {
        sql.close();
    }
});

// API para salvar/atualizar notas do aluno
app.post('/api/notas/salvar', async (req, res) => {
    try {
        const idAluno = parseInt(req.body.idAluno);
        const idTurma = parseInt(req.body.idTurma);
        const idDisc = parseInt(req.body.idDisc);
        const nota1 = req.body.nota1 !== undefined && req.body.nota1 !== null && req.body.nota1 !== '' ? parseFloat(req.body.nota1) : null;
        const nota2 = req.body.nota2 !== undefined && req.body.nota2 !== null && req.body.nota2 !== '' ? parseFloat(req.body.nota2) : null;
        const nota3 = req.body.nota3 !== undefined && req.body.nota3 !== null && req.body.nota3 !== '' ? parseFloat(req.body.nota3) : null;

        if (isNaN(idAluno) || isNaN(idTurma) || isNaN(idDisc)) {
            return res.status(400).json({ success: false, error: 'Aluno, Turma e Disciplina são obrigatórios.' });
        }

        if ((nota1 !== null && (nota1 < 0 || nota1 > 10)) ||
            (nota2 !== null && (nota2 < 0 || nota2 > 10)) ||
            (nota3 !== null && (nota3 < 0 || nota3 > 10))) {
            return res.status(400).json({ success: false, error: 'As notas devem estar entre 0 e 10.' });
        }

        await sql.connect(dbConfig);
        
        // 1. Verificar se existe o vínculo em leciona
        let request = new sql.Request();
        request.input('idTurma', sql.Int, idTurma);
        request.input('idDisc', sql.Int, idDisc);
        
        let lecionaResult = await request.query('SELECT idLeciona FROM leciona WHERE fk_turma = @idTurma AND fk_disciplina = @idDisc');
        let idLeciona;

        if (lecionaResult.recordset.length > 0) {
            idLeciona = lecionaResult.recordset[0].idLeciona;
        } else {
            // Se não existir o vínculo, tentar encontrar um professor para essa disciplina
            let profResult = await request.query('SELECT TOP 1 fk_professor FROM leciona WHERE fk_disciplina = @idDisc');
            let idProf;
            if (profResult.recordset.length > 0) {
                idProf = profResult.recordset[0].fk_professor;
            } else {
                // Senão, pegar qualquer professor do banco
                let anyProfResult = await sql.query('SELECT TOP 1 idProf FROM professor');
                if (anyProfResult.recordset.length > 0) {
                    idProf = anyProfResult.recordset[0].idProf;
                } else {
                    return res.status(400).json({ success: false, error: 'Não há professores cadastrados para vincular a esta disciplina nesta turma.' });
                }
            }

            // Inserir na tabela leciona
            const insertLecionaReq = new sql.Request();
            insertLecionaReq.input('idProf', sql.Int, idProf);
            insertLecionaReq.input('idDisc', sql.Int, idDisc);
            insertLecionaReq.input('idTurma', sql.Int, idTurma);
            
            const newLecionaRes = await insertLecionaReq.query(`
                INSERT INTO leciona (fk_professor, fk_disciplina, fk_turma)
                OUTPUT INSERTED.idLeciona
                VALUES (@idProf, @idDisc, @idTurma)
            `);
            idLeciona = newLecionaRes.recordset[0].idLeciona;
        }

        // 2. Verificar se já existe uma avaliação para esse aluno com este leciona
        const evalRequest = new sql.Request();
        evalRequest.input('idAluno', sql.Int, idAluno);
        evalRequest.input('idLeciona', sql.Int, idLeciona);

        const evalResult = await evalRequest.query('SELECT idAvaliacao FROM avaliacao WHERE fk_aluno = @idAluno AND fk_leciona = @idLeciona');

        if (evalResult.recordset.length > 0) {
            // Atualizar
            const idAvaliacao = evalResult.recordset[0].idAvaliacao;
            const updateReq = new sql.Request();
            updateReq.input('idAvaliacao', sql.Int, idAvaliacao);
            updateReq.input('nota1', sql.Decimal(4, 1), nota1);
            updateReq.input('nota2', sql.Decimal(4, 1), nota2);
            updateReq.input('nota3', sql.Decimal(4, 1), nota3);
            await updateReq.execute('sp_AtualizarAvaliacao');
        } else {
            // Inserir
            const insertReq = new sql.Request();
            insertReq.input('fk_leciona', sql.Int, idLeciona);
            insertReq.input('fk_aluno', sql.Int, idAluno);
            insertReq.input('nota1', sql.Decimal(4, 1), nota1);
            insertReq.input('nota2', sql.Decimal(4, 1), nota2);
            insertReq.input('nota3', sql.Decimal(4, 1), nota3);
            await insertReq.execute('sp_InserirAvaliacao');
        }

        res.json({ success: true, message: 'Notas salvas com sucesso!' });
    } catch (err) {
        console.error('Erro ao salvar notas:', err);
        res.status(500).json({ success: false, error: err.message || 'Erro interno ao salvar notas.' });
    } finally {
        sql.close();
    }
});


// Rota de Professores (renderização da página)
app.get('/professores', (req, res) => {
    res.render('professores', { activeMenu: 'professores' });
});

// API para listar, filtrar e paginar professores
app.get('/api/professores', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const nome = req.query.nome || '';
        const limit = 10;
        const offset = (page - 1) * limit;

        await sql.connect(dbConfig);
        const request = new sql.Request();
        request.input('nome', sql.VarChar, nome);
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);

        const countResult = await request.query(`
            SELECT COUNT(*) AS total
            FROM professor p
            WHERE (@nome = '' OR p.prof_nome LIKE '%' + @nome + '%')
        `);
        const totalProfessores = countResult.recordset[0].total;
        const totalPages = Math.ceil(totalProfessores / limit) || 1;

        const listResult = await request.query(`
            SELECT p.idProf, p.prof_nome, p.prof_matricula, p.prof_status,
                   (
                       SELECT TOP 1 d.disc_nome 
                       FROM leciona l 
                       INNER JOIN disciplina d ON l.fk_disciplina = d.idDisc 
                       WHERE l.fk_professor = p.idProf
                   ) AS especialidade
            FROM professor p
            WHERE (@nome = '' OR p.prof_nome LIKE '%' + @nome + '%')
            ORDER BY p.prof_nome
            OFFSET @offset ROWS
            FETCH NEXT @limit ROWS ONLY
        `);

        res.json({
            professores: listResult.recordset,
            totalProfessores: totalProfessores,
            currentPage: page,
            totalPages: totalPages
        });
    } catch (err) {
        console.error('Erro na API de professores:', err);
        res.status(500).json({ error: 'Erro ao buscar professores do banco de dados' });
    } finally {
        sql.close();
    }
});

// API para cadastrar um novo professor
app.post('/api/professores', async (req, res) => {
    try {
        const { nome, especialidade, nivelAcesso } = req.body;

        if (!nome || !nome.trim()) {
            return res.status(400).json({ error: 'O nome do professor é obrigatório.' });
        }

        await sql.connect(dbConfig);

        // 1. Gerar matrícula única (MAX(prof_matricula) + 1)
        const matResult = await sql.query('SELECT COALESCE(MAX(prof_matricula), 1000) AS maxMat FROM professor');
        const nextMatricula = matResult.recordset[0].maxMat + 1;

        // 2. Gerar CPF único aleatório para cumprir a constraint UNIQUE NOT NULL
        const randomCpfNum = Math.floor(10000000000 + Math.random() * 90000000000).toString();
        const nextCpf = `${randomCpfNum.substring(0,3)}.${randomCpfNum.substring(3,6)}.${randomCpfNum.substring(6,9)}-${randomCpfNum.substring(9,11)}`;

        // 3. Email institucional a partir do nome
        const emailSlug = nome.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '.');
        const nextEmail = `${emailSlug}@escolaabc.com`;

        // 4. Inserir na tabela professor
        const insertRequest = new sql.Request();
        insertRequest.input('nome', sql.VarChar, nome.trim());
        insertRequest.input('matricula', sql.Int, nextMatricula);
        insertRequest.input('cpf', sql.VarChar, nextCpf);
        insertRequest.input('email', sql.VarChar, nextEmail);

        const insertResult = await insertRequest.query(`
            INSERT INTO professor 
                (prof_nome, prof_matricula, prof_cpf, prof_dateNasc, prof_email, prof_celular, prof_cep, prof_bairro, prof_casaNum, prof_logradouro, fk_cidade, prof_status)
            OUTPUT INSERTED.idProf
            VALUES 
                (@nome, @matricula, @cpf, '1980-01-01', @email, '27999990000', '29100-000', 'Centro', 100, 'Rua Principal', 1, 1)
        `);

        const newIdProf = insertResult.recordset[0].idProf;

        // 5. Vincular a especialidade/disciplina se fornecida
        if (especialidade && especialidade.trim()) {
            const espName = especialidade.trim();
            const discRequest = new sql.Request();
            discRequest.input('espName', sql.VarChar, espName);

            // Verificar se a disciplina já existe
            let discResult = await discRequest.query('SELECT idDisc FROM disciplina WHERE LOWER(disc_nome) = LOWER(@espName)');
            let idDisc;

            if (discResult.recordset.length > 0) {
                idDisc = discResult.recordset[0].idDisc;
            } else {
                // Inserir nova disciplina
                const newDiscResult = await discRequest.query(`
                    INSERT INTO disciplina (disc_nome, disc_descricao)
                    OUTPUT INSERTED.idDisc
                    VALUES (@espName, 'Disciplina de ' + @espName)
                `);
                idDisc = newDiscResult.recordset[0].idDisc;
            }

            // Inserir relacionamento leciona na turma padrão 1
            const lecRequest = new sql.Request();
            lecRequest.input('idProf', sql.Int, newIdProf);
            lecRequest.input('idDisc', sql.Int, idDisc);
            await lecRequest.query(`
                IF NOT EXISTS (SELECT 1 FROM leciona WHERE fk_professor = @idProf AND fk_disciplina = @idDisc AND fk_turma = 1)
                BEGIN
                    INSERT INTO leciona (fk_professor, fk_disciplina, fk_turma)
                    VALUES (@idProf, @idDisc, 1)
                END
            `);
        }

        res.json({ success: true, message: 'Professor cadastrado com sucesso!', idProf: newIdProf, matricula: nextMatricula });
    } catch (err) {
        console.error('Erro ao cadastrar professor:', err);
        res.status(500).json({ error: 'Erro interno ao salvar professor no banco de dados: ' + err.message });
    } finally {
        sql.close();
    }
});

// API para excluir um professor
app.delete('/api/professores/:id', async (req, res) => {
    try {
        const idProf = parseInt(req.params.id);
        if (isNaN(idProf)) {
            return res.status(400).json({ error: 'ID do professor inválido.' });
        }

        await sql.connect(dbConfig);
        const request = new sql.Request();
        request.input('idProf', sql.Int, idProf);

        // 1. Remover vínculos da tabela leciona primeiro para evitar restrição de chave estrangeira
        await request.query('DELETE FROM leciona WHERE fk_professor = @idProf');

        // 2. Excluir o professor
        await request.query('DELETE FROM professor WHERE idProf = @idProf');

        res.json({ success: true, message: 'Professor removido com sucesso!' });
    } catch (err) {
        console.error('Erro ao excluir professor:', err);
        res.status(500).json({ error: 'Erro ao excluir professor do banco de dados: ' + err.message });
    } finally {
        sql.close();
    }
});

// Rota de Turmas
app.get('/turmas', (req, res) => {
    res.render('turmas', { activeMenu: 'turmas' });
});

// Rota de Relatórios
app.get('/relatorios', (req, res) => {
    res.render('relatorios', { activeMenu: 'relatorios' });
});

// Teste de conexão com o banco de dados
app.get('/test-db', async (req, res) => {
    try {
        await sql.connect(dbConfig);
        const result = await sql.query`SELECT 1 AS number`;
        res.send('Conexão com o banco de dados estabelecida com sucesso! ' + JSON.stringify(result.recordset));
    } catch (err) {
        console.error('Erro ao conectar ao banco de dados:', err);
        res.status(500).send('Erro ao conectar ao banco de dados: ' + err.message);
    } finally {
        sql.close();
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});
