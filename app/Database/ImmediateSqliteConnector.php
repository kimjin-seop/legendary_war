<?php

namespace App\Database;

use Illuminate\Database\Connectors\SQLiteConnector;

class ImmediateSqliteConnector extends SQLiteConnector
{
    protected function createPdoConnection($dsn, $username, #[\SensitiveParameter] $password, $options)
    {
        return new ImmediatePdo($dsn, $username, $password, $options);
    }
}
