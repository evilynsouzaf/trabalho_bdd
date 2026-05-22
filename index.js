const express = require('express');
const sql = require('mssql');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Configuração do banco de dados (Ajuste com suas credenciais)
const dbConfig = {
    user: 'seu_usuario',
    password: 'sua_senha',
    server: 'localhost', // Pode ser o IP ou nome do servidor SQL Server
    database: 'EscolaABC', // Nome do seu banco de dados
    options: {
        encrypt: true, // Use true se estiver no Azure
        trustServerCertificate: true // Necessário para desenvolvimento local
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
app.get('/', (req, res) => {
    res.render('home', { activeMenu: 'dashboard' });
});

// Rota de login
app.get('/login', (req, res) => {
    res.render('login');
});

// Rota de Alunos
app.get('/alunos', (req, res) => {
    res.render('gestao_alunos', { activeMenu: 'alunos' });
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
