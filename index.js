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
app.get('/alunos/novo', (req, res) => {
    res.render('criar_aluno', { activeMenu: 'alunos' });
});

// Rota de Notas
app.get('/notas', (req, res) => {
    res.render('notas', { activeMenu: 'notas' });
});


// Rota de Professores
app.get('/professores', (req, res) => {
    res.render('professores', { activeMenu: 'professores' });
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
